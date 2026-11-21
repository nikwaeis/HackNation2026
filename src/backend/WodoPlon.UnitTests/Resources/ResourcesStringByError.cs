using System.Globalization;
using System.Reflection;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using WodoPlon.Api.Resources;
using WodoPlon.Domain.Results;

namespace WodoPlon.UnitTests.Resources;

public class ResourcesStringByError
{
    private static IStringLocalizer<SharedResources> CreateLocalizer()
    {
        var options = Options.Create(new LocalizationOptions { ResourcesPath = "" });
        var factory = new ResourceManagerStringLocalizerFactory(options, NullLoggerFactory.Instance);
        return new StringLocalizer<SharedResources>(factory);
    }
    
    [Theory]
    [InlineData("pl")]
    [InlineData("en")]
    public void All_ErrorCodes_Should_Have_LocalizationString_Api(string culture)
    {
        // Arrange
        CultureInfo.CurrentUICulture = CultureInfo.GetCultureInfo(culture);
        var errorCodes = typeof(Program).Assembly
            .GetTypes()
            .Where(t => t.IsAbstract && t.IsSealed && t.FullName!.Contains("ErrorCodes"))
            .SelectMany(t => t.GetFields(BindingFlags.Public | BindingFlags.Static | BindingFlags.FlattenHierarchy))
            .Where(f => f.IsLiteral && f.Name is not ("LocalIdentity" or "CurrentIdentity") && f.FieldType == typeof(string))
            .Select(f => (string)f.GetRawConstantValue()!)
            .ToList();
        var localizer = CreateLocalizer();

        // Act
        var missingKeys = errorCodes
            .Where(code => localizer[code].ResourceNotFound)
            .ToList();

        // Assert
        missingKeys.Should().BeEmpty(because: $"Miss resource key in SharedResources.{culture}.resx:\n\n\t{string.Join("\n\t", missingKeys.Select(p => $"- {p}"))}");
    }
    
    [Theory]
    [InlineData("pl")]
    [InlineData("en")]
    public void All_ErrorCodes_Should_Have_LocalizationString_Domain(string culture)
    {
        // Arrange
        CultureInfo.CurrentUICulture = CultureInfo.GetCultureInfo(culture);
        var errorCodes = typeof(Result).Assembly
            .GetTypes()
            .Where(t => t.IsAbstract && t.IsSealed && t.FullName!.Contains("ErrorCodes"))
            .SelectMany(t => t.GetFields(BindingFlags.Public | BindingFlags.Static | BindingFlags.FlattenHierarchy))
            .Where(f => f.IsLiteral && f.Name is not ("LocalIdentity" or "CurrentIdentity") && f.FieldType == typeof(string))
            .Select(f => (string)f.GetRawConstantValue()!)
            .ToList();
        var localizer = CreateLocalizer();

        // Act
        var missingKeys = errorCodes
            .Where(code => localizer[code].ResourceNotFound)
            .ToList();

        // Assert
        missingKeys.Should().BeEmpty(because: $"\n\nMiss resource key in SharedResources.{culture}.resx:\n\n\t{string.Join("\n\t", missingKeys.Select(p => $"- {p}"))}\n\n");
    }
}