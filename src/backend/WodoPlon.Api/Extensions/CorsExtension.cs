using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.Extensions.Options;
using WodoPlon.Api.Common.Models;
using WodoPlon.Api.Common.Options;

namespace WodoPlon.Api.Extensions;

public static class CorsExtension
{
    public static IServiceCollection AddCorsPolicies(this IServiceCollection services)
    {
        services.AddCors();
        services.AddOptions<CorsOptions>().Configure<IOptions<CorsSettings>>((options, settings) =>
        {
            var s = settings.Value;

            options.AddPolicy(CorsPolicies.PublicWeb, p => p
                .WithOrigins(s.WebOrigin)
                .AllowAnyMethod()
                .WithHeaders("Content-Type", "Accept", "Accept-Language")
                .SetPreflightMaxAge(TimeSpan.FromHours(1)));

            options.AddPolicy(CorsPolicies.PublicRead, p => p
                .AllowAnyOrigin()
                .WithMethods("GET")
                .WithHeaders("Accept", "Accept-Language"));
        });

        return services;
    }
}
