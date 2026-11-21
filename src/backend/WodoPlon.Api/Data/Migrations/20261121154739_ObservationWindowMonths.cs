using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WodoPlon.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ObservationWindowMonths : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "historical_drought_years",
                table: "dynamic_observations");

            migrationBuilder.AddColumn<string>(
                name: "window_months",
                table: "dynamic_observations",
                type: "jsonb",
                nullable: false,
                defaultValue: "[]");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "window_months",
                table: "dynamic_observations");

            migrationBuilder.AddColumn<int>(
                name: "historical_drought_years",
                table: "dynamic_observations",
                type: "integer",
                nullable: true);
        }
    }
}
