using WodoPlon.Api.Common.Models;
using WodoPlon.Domain.Results;

namespace WodoPlon.Api.Common.Interface;

public interface IUserAgentService
{
    Result<ParsedAgent> ParseFromRaw(string rawAgent);
}
