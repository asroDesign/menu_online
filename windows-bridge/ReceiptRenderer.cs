// Shared by the Windows service and the desktop bridge (PowerShell Add-Type).
// Keep compatible with the Windows PowerShell C# compiler.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Printing;
using System.IO;
using System.Text.RegularExpressions;

public static class MenuPeakReceiptRenderer
{
    private sealed class Row
    {
        public string[] Cells;
        public bool Border;
        public bool Framed;
        public float Height;
    }

    public static Bitmap Render(string content, int width, out List<int> breaks)
    {
        if (width < 200 || width > 1200) throw new ArgumentOutOfRangeException("width");
        var rows = new List<Row>();
        using (var measure = new Bitmap(width, 1))
        using (var g = Graphics.FromImage(measure))
        using (var font = new Font("Tahoma", width / 21f, FontStyle.Regular, GraphicsUnit.Pixel))
        using (var format = Format())
        {
            foreach (string source in content.Replace("\r", "").Split('\n'))
            {
                string line = source.Trim();
                bool border = Regex.IsMatch(line, @"^\+[-+]+\+$");
                bool framed = line.StartsWith("|") && line.EndsWith("|");
                string[] cells = framed ? line.Substring(1, line.Length - 2).Split('|') : new string[] { line };
                float height = border ? 3 : font.Height + 12;
                if (!border)
                    for (int i = 0; i < cells.Length; i++)
                    {
                        cells[i] = cells[i].Trim();
                        float cellWidth = CellWidth(width - 16, cells.Length, i);
                        height = Math.Max(height, g.MeasureString(cells[i], font, (int)(cellWidth - 12), format).Height + 12);
                    }
                rows.Add(new Row { Cells = cells, Border = border, Framed = framed, Height = (float)Math.Ceiling(height) });
            }
        }
        int total = 16;
        foreach (var row in rows) total += (int)row.Height;
        if (total > 50000) throw new InvalidOperationException("Receipt exceeds safe rendering height.");
        var bitmap = new Bitmap(width, Math.Max(total, 24));
        breaks = new List<int>();
        using (var g = Graphics.FromImage(bitmap))
        using (var font = new Font("Tahoma", width / 21f, FontStyle.Regular, GraphicsUnit.Pixel))
        using (var pen = new Pen(Color.Black, 1.5f))
        using (var format = Format())
        {
            g.Clear(Color.White);
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
            float y = 8;
            foreach (var row in rows)
            {
                if (row.Border) g.DrawLine(pen, 8, y + 1, width - 8, y + 1);
                else
                {
                    float right = width - 8;
                    for (int i = 0; i < row.Cells.Length; i++)
                    {
                        float w = CellWidth(width - 16, row.Cells.Length, i);
                        float left = right - w;
                        if (row.Framed)
                        {
                            g.DrawLine(pen, left, y, left, y + row.Height);
                            if (i == 0) g.DrawLine(pen, right, y, right, y + row.Height);
                        }
                        format.Alignment = row.Cells.Length > 1 && i > 0 ? StringAlignment.Center : StringAlignment.Near;
                        g.DrawString(row.Cells[i], font, Brushes.Black, new RectangleF(left + 6, y + 6, w - 12, row.Height - 8), format);
                        right = left;
                    }
                }
                y += row.Height;
                breaks.Add((int)y);
            }
        }
        return bitmap;
    }

    private static float CellWidth(float width, int count, int index)
    {
        if (count == 3) return width * (index == 0 ? .58f : index == 1 ? .14f : .28f);
        if (count == 2) return width * (index == 0 ? .22f : .78f);
        return width / count;
    }

    private static StringFormat Format()
    {
        return new StringFormat { Alignment = StringAlignment.Near, FormatFlags = StringFormatFlags.DirectionRightToLeft, Trimming = StringTrimming.None };
    }

    public static void Print(string printerName, string content)
    {
        using (var document = new PrintDocument())
        {
            document.PrinterSettings.PrinterName = printerName;
            if (!document.PrinterSettings.IsValid) throw new InvalidOperationException("Invalid Windows printer: " + printerName);
            document.DocumentName = "MenuPeak receipt";
            document.PrintController = new StandardPrintController();
            document.DefaultPageSettings.Margins = new Margins(5, 5, 5, 5);
            List<int> breaks;
            using (var bitmap = Render(content, 576, out breaks))
            {
                int offset = 0;
                document.PrintPage += delegate(object sender, PrintPageEventArgs args)
                {
                    float scale = args.MarginBounds.Width / (float)bitmap.Width;
                    int capacity = (int)(args.MarginBounds.Height / scale);
                    if (capacity < 1) throw new InvalidOperationException("Invalid printer page size.");
                    int end = Math.Min(bitmap.Height, offset + capacity);
                    if (end < bitmap.Height)
                        foreach (int boundary in breaks) if (boundary > offset && boundary <= offset + capacity) end = boundary;
                    int height = end - offset;
                    args.Graphics.DrawImage(bitmap, new RectangleF(args.MarginBounds.Left, args.MarginBounds.Top, args.MarginBounds.Width, height * scale), new RectangleF(0, offset, bitmap.Width, height), GraphicsUnit.Pixel);
                    offset = end;
                    args.HasMorePages = offset < bitmap.Height;
                };
                document.Print();
            }
        }
    }

    // 384 dots fits common 58 mm and 80 mm ESC/POS printers; no text codepage dependency.
    public static byte[] Raster(string content)
    {
        List<int> breaks;
        using (var bitmap = Render(content, 384, out breaks))
        using (var output = new MemoryStream())
        {
            output.Write(new byte[] { 27, 64, 27, 97, 1 }, 0, 5);
            int byteWidth = bitmap.Width / 8;
            for (int y = 0; y < bitmap.Height; y += 64)
            {
                int height = Math.Min(64, bitmap.Height - y);
                byte[] header = { 29, 118, 48, 0, (byte)byteWidth, (byte)(byteWidth >> 8), (byte)height, (byte)(height >> 8) };
                output.Write(header, 0, header.Length);
                for (int row = 0; row < height; row++)
                    for (int x = 0; x < bitmap.Width; x += 8)
                    {
                        byte value = 0;
                        for (int bit = 0; bit < 8; bit++)
                            if (bitmap.GetPixel(x + bit, y + row).R < 160) value |= (byte)(128 >> bit);
                        output.WriteByte(value);
                    }
            }
            byte[] end = { 10, 10, 10, 29, 86, 66, 0 };
            output.Write(end, 0, end.Length);
            return output.ToArray();
        }
    }
}
