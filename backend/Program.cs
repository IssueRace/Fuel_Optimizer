/*
 * FuelFlow API Service Configuration.
 * Configures rate limiting, database context, routing, and optimization services.
 */

using FuelOptimizer.Api.Services;
using Microsoft.EntityFrameworkCore;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

builder.Services.AddHttpClient();
builder.Services.AddHttpClient("Tankerkoenig", c =>
{
    c.Timeout = TimeSpan.FromSeconds(3);
});
builder.Services.AddScoped<RoutingService>();
builder.Services.AddScoped<OptimizationService>();

var dbFolder = Path.Combine(AppContext.BaseDirectory, "data");
if (!Directory.Exists(dbFolder))
{
    Directory.CreateDirectory(dbFolder);
}
builder.Services.AddDbContext<FuelOptimizerContext>(o => o.UseSqlite($"Data Source={Path.Combine(dbFolder, "fueloptimizer.db")}"));
builder.Services.AddMemoryCache();
builder.Services.AddScoped<TankerkoenigService>();

builder.Services.AddRateLimiter(options =>
{
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 30,
                Window = TimeSpan.FromMinutes(1)
            }));
    options.RejectionStatusCode = 429;
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll",
        policy => policy.AllowAnyOrigin()
                        .AllowAnyMethod()
                        .AllowAnyHeader());
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<FuelOptimizerContext>();
    db.Database.EnsureCreated();
    db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");
}

app.UseRateLimiter();
app.UseCors("AllowAll");
app.UseAuthorization();
app.MapControllers();

app.MapGet("/api/health", () => new { Status = "Healthy" });

app.Run();
