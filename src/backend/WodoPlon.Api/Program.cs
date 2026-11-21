using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using StackExchange.Redis;
using WodoPlon.Api.Common.Filters;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Common.Models;
using WodoPlon.Api.Common.Options;
using WodoPlon.Api.Common.Seeds;
using WodoPlon.Api.Common.Services;
using WodoPlon.Api.Data;
using WodoPlon.Api.Extensions;
using WodoPlon.Api.Features.Analysis.Shared;
using WodoPlon.Api.Features.Health;
using WodoPlon.Api.Middleware;

var builder = WebApplication.CreateBuilder(args);
// docker secrets: file name = config key ("__" as ":"), absent outside prod
builder.Configuration.AddKeyPerFile("/run/secrets", optional: true);

// Global Exception Handler registration
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

// OpenAPI
builder.Services.AddOpenApi();

// Db connection
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"),
        npgsql => npgsql.UseNetTopologySuite()));

// Redis + HybridCache
var redisOptions = ConfigurationOptions.Parse(builder.Configuration.GetRequired("Redis:ConnectionString"));
redisOptions.AbortOnConnectFail = false;
var redis = await ConnectionMultiplexer.ConnectAsync(redisOptions);
builder.Services.AddSingleton<IConnectionMultiplexer>(redis);
builder.Services.AddStackExchangeRedisCache(options =>
    options.ConnectionMultiplexerFactory = () => Task.FromResult<IConnectionMultiplexer>(redis));
builder.Services.AddHybridCache();

// Core services
builder.Services.AddCommandQuery(typeof(Program).Assembly);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddValidatorsFromAssembly(typeof(Program).Assembly);
builder.Services.AddSingleton<IUserAgentService, UserAgentService>();
builder.Services.AddSingleton<IRateLimitService, RedisRateLimitService>();
builder.Services.AddLocalization();
builder.Services.AddScoped<IDataSeeder, CropSeeder>();
builder.Services.AddScoped<ParcelProfileService>();
builder.Services.AddScoped<ObservationService>();

// enums go over the wire as names, not numbers
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(allowIntegerValues: false)));

// Typed HttpClients: ULDK, Open-Meteo, SoilGrids, Overpass, Python geo-worker
builder.Services.AddExternalApiClients();

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;

    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

// All options registration
builder.Services.AddAppOptions();
builder.Services.AddCorsPolicies();

var app = builder.Build();

// Dev migration & OpenAPI
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();

    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
}

// Seed start
if (args.Contains("--seed") || app.Configuration.GetValue<bool>("Database:RunSeed"))
{
    using var scope = app.Services.CreateScope();
    var seeders = scope.ServiceProvider.GetServices<IDataSeeder>()
        .OrderBy(s => s.Order);

    foreach (var seeder in seeders)
    {
        await seeder.SeedAsync();
    }

    if (args.Contains("--exit"))
        return;
}

var supportedCultures = new[] { "pl", "en" };
var localizationOptions = new RequestLocalizationOptions()
    .SetDefaultCulture(supportedCultures[0])
    .AddSupportedCultures(supportedCultures)
    .AddSupportedUICultures(supportedCultures);

// ---- Middleware pipeline ----
app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseCors();
app.UseRequestLocalization(localizationOptions);

var api = app.MapGroup("/api")
    .RequireCors(CorsPolicies.PublicWeb)
    .AddEndpointFilter<ValidationFilter>() // first: invalid requests must not spend rate-limit attempts
    .AddEndpointFilter<RateLimitFilter>();

api.MapHealth();

app.Run();
