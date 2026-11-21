using FluentAssertions;
using WodoPlon.Api.Common;
using WodoPlon.Api.Common.Services;
using WodoPlon.Domain.Results;

namespace WodoPlon.UnitTests.Infrastructure;

public class InfrastructureSanityTests
{
    [Fact]
    public void Result_Success_HasNoErrors()
    {
        var result = Result.Success();

        result.IsSuccess.Should().BeTrue();
        result.IsFailure.Should().BeFalse();
        result.Errors.Should().BeEmpty();
    }

    [Fact]
    public void Result_Failure_CollectsErrorsViaGuard()
    {
        var err1 = ResultError.Validation("Test.First");
        var err2 = ResultError.NotFound("Test.Second");

        var errors = Guard.Errors(Result.Failure(err1), Result.Failure(err2));

        errors.Should().HaveCount(2);
        errors[0].Code.Should().Be("Test.First");
        errors[1].Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public void UserAgentService_ParsesChromeOnMac()
    {
        var service = new UserAgentService();
        var ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

        var result = service.ParseFromRaw(ua);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Os.Should().Be("macOS");
        result.Value.Browser.Should().Be("Chrome");
        result.Value.DeviceInfo.Should().Be("Desktop");
    }
}
