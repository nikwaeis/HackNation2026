using System.Globalization;
using System.Resources;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using WodoPlon.Api.Features.Analysis.Shared;
using WodoPlon.Api.Resources;
using WodoPlon.Domain.Results;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.UnitTests.Analysis;

public class CoalescingTests
{
    private static FetchCoalescer Coalescer()
    {
        var services = new ServiceCollection();
        services.AddHybridCache();
        var provider = services.BuildServiceProvider();
        return new FetchCoalescer(provider.GetRequiredService<Microsoft.Extensions.Caching.Hybrid.HybridCache>(),
            provider.GetRequiredService<IServiceScopeFactory>());
    }

    [Fact]
    public async Task Concurrent_Requests_For_One_Key_Run_The_Work_Once()
    {
        var coalescer = Coalescer();
        int runs = 0;
        var gate = new TaskCompletionSource();

        var calls = Enumerable.Range(0, 5).Select(_ => coalescer.RunAsync("parcel:x", async (_, _) =>
        {
            Interlocked.Increment(ref runs);
            await gate.Task;
            return Result.Success();
        })).ToArray();
        gate.SetResult();
        var results = await Task.WhenAll(calls);

        runs.Should().Be(1);
        results.Should().OnlyContain(r => r.IsSuccess);
    }

    [Fact]
    public async Task Same_Click_Point_Shares_One_Lookup_And_Its_Parcel_Id()
    {
        var coalescer = Coalescer();
        int runs = 0;
        var gate = new TaskCompletionSource();

        var calls = Enumerable.Range(0, 5).Select(_ => coalescer.RunForValueAsync("point:53.06050:18.44100", async (_, _) =>
        {
            Interlocked.Increment(ref runs);
            await gate.Task;
            return Result<string>.Success("041509_2.0004.437/3");
        })).ToArray();
        gate.SetResult();
        var results = await Task.WhenAll(calls);

        runs.Should().Be(1);
        results.Should().OnlyContain(r => r.IsSuccess && r.Value == "041509_2.0004.437/3");
    }

    [Fact]
    public async Task Failure_Is_Not_Cached_And_Keeps_Code_And_Args()
    {
        var coalescer = Coalescer();
        int runs = 0;

        var failed = await coalescer.RunAsync("obs:x", (_, _) =>
        {
            runs++;
            return Task.FromResult<Result>(ResultError.NotFound("External.ParcelNotFound", 42));
        });
        var retried = await coalescer.RunAsync("obs:x", (_, _) =>
        {
            runs++;
            return Task.FromResult(Result.Success());
        });

        failed.Errors.Should().ContainSingle(e => e.Code == "External.ParcelNotFound" && e.Type == ErrorType.NotFound);
        failed.Errors[0].Args.Should().Equal("42");
        retried.IsSuccess.Should().BeTrue();
        runs.Should().Be(2);
    }

    [Fact]
    public void Hydro_Queue_Holds_A_Parcel_Once_Until_Done()
    {
        var queue = new HydroLookupQueue();
        var id = ParcelIdVo.Create("040101_1.0001.123/4").Value;

        queue.Enqueue(id).Should().BeTrue();
        queue.Enqueue(id).Should().BeFalse();
        queue.Done(id);
        queue.Enqueue(id).Should().BeTrue();
    }

    [Fact]
    public void Every_Report_Text_Exists_In_Both_Languages()
    {
        var manager = new ResourceManager(typeof(SharedResources).FullName!, typeof(SharedResources).Assembly);
        string[] Keys(string culture) => manager.GetResourceSet(CultureInfo.GetCultureInfo(culture), true, false)!
            .Cast<System.Collections.DictionaryEntry>()
            .Select(e => (string)e.Key)
            .Where(k => k.StartsWith("Report.") || k.StartsWith("Crop."))
            .Order()
            .ToArray();

        Keys("pl").Should().NotBeEmpty().And.Equal(Keys("en"));
        TestTexts.Use("pl")["Report.Months"].Split(',').Should().HaveCount(12);
        TestTexts.Use("en")["Report.Months"].Split(',').Should().HaveCount(12);
    }
}
