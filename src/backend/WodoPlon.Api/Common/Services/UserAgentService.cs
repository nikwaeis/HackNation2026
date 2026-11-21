using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Common.Models;
using WodoPlon.Domain.Results;

namespace WodoPlon.Api.Common.Services;

public sealed class UserAgentService : IUserAgentService
{
    private const string Unknown = "Unknown";
    private const int MaxDeviceInfoLength = 256;

    public Result<ParsedAgent> ParseFromRaw(string rawAgent)
    {
        if (string.IsNullOrWhiteSpace(rawAgent))
        {
            return Result<ParsedAgent>.Success(new ParsedAgent(Unknown, Unknown, Unknown));
        }

        var os = DetectOs(rawAgent);
        var browser = DetectBrowser(rawAgent);
        var deviceInfo = DetectDeviceInfo(rawAgent);

        return Result<ParsedAgent>.Success(new ParsedAgent(os, browser, deviceInfo));
    }

    private static string DetectOs(string ua)
    {
        if (ua.Contains("Windows NT 10.0", StringComparison.OrdinalIgnoreCase)) return "Windows 10/11";
        if (ua.Contains("Windows", StringComparison.OrdinalIgnoreCase)) return "Windows";
        if (ua.Contains("Android", StringComparison.OrdinalIgnoreCase)) return "Android";
        if (ua.Contains("iPhone", StringComparison.OrdinalIgnoreCase) || ua.Contains("iPad", StringComparison.OrdinalIgnoreCase)) return "iOS";
        if (ua.Contains("Macintosh", StringComparison.OrdinalIgnoreCase) || ua.Contains("Mac OS X", StringComparison.OrdinalIgnoreCase)) return "macOS";
        if (ua.Contains("Linux", StringComparison.OrdinalIgnoreCase)) return "Linux";

        return Unknown;
    }

    private static string DetectBrowser(string ua)
    {
        if (ua.Contains("Edg/", StringComparison.OrdinalIgnoreCase)) return "Edge";
        if (ua.Contains("OPR/", StringComparison.OrdinalIgnoreCase) || ua.Contains("Opera", StringComparison.OrdinalIgnoreCase)) return "Opera";
        if (ua.Contains("Chrome/", StringComparison.OrdinalIgnoreCase) && !ua.Contains("Chromium", StringComparison.OrdinalIgnoreCase)) return "Chrome";
        if (ua.Contains("Safari/", StringComparison.OrdinalIgnoreCase) && !ua.Contains("Chrome", StringComparison.OrdinalIgnoreCase)) return "Safari";
        if (ua.Contains("Firefox/", StringComparison.OrdinalIgnoreCase)) return "Firefox";

        return Unknown;
    }

    private static string DetectDeviceInfo(string ua)
    {
        if (ua.Contains("iPhone", StringComparison.OrdinalIgnoreCase)) return "iPhone";
        if (ua.Contains("iPad", StringComparison.OrdinalIgnoreCase)) return "iPad";
        if (ua.Contains("Mobile", StringComparison.OrdinalIgnoreCase) || ua.Contains("Android", StringComparison.OrdinalIgnoreCase)) return "Mobile";
        if (ua.Contains("Windows", StringComparison.OrdinalIgnoreCase) || ua.Contains("Macintosh", StringComparison.OrdinalIgnoreCase) || ua.Contains("Linux", StringComparison.OrdinalIgnoreCase)) return "Desktop";

        var sanitized = ua.Trim();
        if (sanitized.Length > MaxDeviceInfoLength)
        {
            sanitized = sanitized[..MaxDeviceInfoLength];
        }

        return string.IsNullOrWhiteSpace(sanitized) ? Unknown : sanitized;
    }
}
