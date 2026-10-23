using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System.Text;

namespace MenuPeak.PrinterService;

internal static class Program
{
    private static void Main(string[] args)
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        Host.CreateDefaultBuilder(args)
            .UseWindowsService(options => options.ServiceName = "MenuPeak Printer Service")
            .ConfigureServices(services => services.AddHostedService<PrinterWorker>())
            .Build()
            .Run();
    }
}
