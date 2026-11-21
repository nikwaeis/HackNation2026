using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WodoPlon.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class HydroFeatureOsmId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "osm_id",
                table: "hydro_features",
                type: "bigint",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ux_hydro_features_osm_id",
                table: "hydro_features",
                column: "osm_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_hydro_features_osm_id",
                table: "hydro_features");

            migrationBuilder.DropColumn(
                name: "osm_id",
                table: "hydro_features");
        }
    }
}
