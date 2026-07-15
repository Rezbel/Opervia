using Opervia.Application.Connections;
using Opervia.Application.Schema;
using Opervia.Application.Tables;
using Opervia.Infrastructure.Firebird;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();

builder.Services.AddScoped<
    ISaeConnectionTester,
    FirebirdSaeConnectionTester
>();

builder.Services.AddScoped<
    ISaeSchemaInspector,
    FirebirdSaeSchemaInspector
>();

builder.Services.AddScoped<
    ISaeTableStructureInspector,
    FirebirdSaeTableStructureInspector
>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseAuthorization();

app.MapControllers();

app.Run();
