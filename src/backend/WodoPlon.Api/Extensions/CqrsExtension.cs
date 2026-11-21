using System.Reflection;
using WodoPlon.Api.Common.Interface;

namespace WodoPlon.Api.Extensions;

public static class CqrsExtension
{
    public static IServiceCollection AddCommandQuery(this IServiceCollection services, Assembly? assembly = null)
    {
        var targetAssembly = assembly ?? typeof(CqrsExtension).Assembly;

        RegisterHandlers(services, targetAssembly, typeof(ICommandHandler<>));
        RegisterHandlers(services, targetAssembly, typeof(ICommandHandler<,>));
        RegisterHandlers(services, targetAssembly, typeof(IQueryHandler<,>));

        return services;
    }

    private static void RegisterHandlers(IServiceCollection services, Assembly assembly, Type openGenericHandlerType)
    {
        var implementations = assembly.GetTypes()
            .Where(t => t is { IsClass: true, IsAbstract: false });

        foreach (var implementation in implementations)
        {
            var handlerInterfaces = implementation.GetInterfaces()
                .Where(i => i.IsGenericType && i.GetGenericTypeDefinition() == openGenericHandlerType);

            foreach (var handlerInterface in handlerInterfaces)
            {
                services.AddScoped(handlerInterface, implementation);
            }
        }
    }
}
