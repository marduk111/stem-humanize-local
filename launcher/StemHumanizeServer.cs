// Stem Humanize local server host.
// Serves the web app from an embedded folder over http://127.0.0.1:<port>/
// so AudioWorklet modules load correctly, then opens the default browser.
// Lives in the tray; double-click or "Open" re-opens the app.

using System;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;

static class Program
{
    static string webRoot;
    static string dataDir;
    static string portFile;
    static int port;
    static TcpListener tcp;
    static NotifyIcon tray;
    static string version = "dev";
    static bool shuttingDown;

    [STAThread]
    static void Main(string[] args)
    {
        string exeDir = Path.GetDirectoryName(Application.ExecutablePath);
        webRoot = Path.Combine(exeDir, "app");
        if (!Directory.Exists(webRoot)) webRoot = exeDir;

        if (args != null && args.Length >= 2 && args[0] == "--root")
            webRoot = Path.GetFullPath(args[1]);

        dataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "StemHumanize");
        portFile = Path.Combine(dataDir, "server.port");

        version = ReadVersion();

        // If an instance is already serving, just focus it.
        int running;
        if (TryReadPort(out running) && IsListening(running))
        {
            OpenBrowser(running);
            return;
        }

        try
        {
            tcp = new TcpListener(IPAddress.Loopback, 0);
            tcp.Start();
            port = ((IPEndPoint)tcp.LocalEndpoint).Port;
        }
        catch (Exception ex)
        {
            Fail("Could not start the local server.\r\n\r\n" + ex.Message);
            return;
        }

        try
        {
            Directory.CreateDirectory(dataDir);
            File.WriteAllText(portFile, port.ToString(CultureInfo.InvariantCulture));
        }
        catch { /* non-fatal */ }

        Thread serverThread = new Thread(ServeLoop);
        serverThread.IsBackground = true;
        serverThread.Start();

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        CreateTray();
        OpenBrowser(port);
        Application.Run();
        Cleanup();
    }

    static string ReadVersion()
    {
        try
        {
            string jsonPath = Path.Combine(webRoot, "version.json");
            if (File.Exists(jsonPath))
            {
                string text = File.ReadAllText(jsonPath);
                int i = text.IndexOf("\"version\"", StringComparison.OrdinalIgnoreCase);
                if (i >= 0)
                {
                    int q1 = text.IndexOf('"', text.IndexOf(':', i) + 1);
                    int q2 = text.IndexOf('"', q1 + 1);
                    if (q1 >= 0 && q2 > q1)
                        return text.Substring(q1 + 1, q2 - q1 - 1);
                }
            }

            string plain = Path.Combine(webRoot, "VERSION");
            if (File.Exists(plain))
            {
                string v = File.ReadAllText(plain).Trim();
                if (v.Length > 0) return v;
            }
        }
        catch { }
        return "dev";
    }

    static bool TryReadPort(out int value)
    {
        value = 0;
        try
        {
            if (!File.Exists(portFile)) return false;
            string s = File.ReadAllText(portFile).Trim();
            return int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out value);
        }
        catch { return false; }
    }

    static bool IsListening(int p)
    {
        try
        {
            using (TcpClient c = new TcpClient())
            {
                IAsyncResult ar = c.BeginConnect(IPAddress.Loopback, p, null, null);
                if (!ar.AsyncWaitHandle.WaitOne(300)) return false;
                c.EndConnect(ar);
                return true;
            }
        }
        catch { return false; }
    }

    static void OpenBrowser(int p)
    {
        try { Process.Start("http://127.0.0.1:" + p.ToString(CultureInfo.InvariantCulture) + "/"); }
        catch { }
    }

    static void CreateTray()
    {
        tray = new NotifyIcon();
        try { tray.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); }
        catch { tray.Icon = SystemIcons.Application; }

        tray.Text = "Stem Humanize " + version;
        tray.Visible = true;

        ContextMenu menu = new ContextMenu();
        menu.MenuItems.Add("Open Stem Humanize", delegate { OpenBrowser(port); });
        menu.MenuItems.Add("Copy link", delegate { TryClipboard("http://127.0.0.1:" + port + "/"); });
        menu.MenuItems.Add("-");
        menu.MenuItems.Add("Open app folder", delegate { Process.Start(webRoot); });
        menu.MenuItems.Add("Changelog", delegate { OpenBrowser(port, "/CHANGELOG.md"); });
        menu.MenuItems.Add("About", delegate { ShowAbout(); });
        menu.MenuItems.Add("-");
        menu.MenuItems.Add("Exit", delegate { Shutdown(); });

        tray.ContextMenu = menu;
        tray.DoubleClick += delegate { OpenBrowser(port); };
    }

    static void TryClipboard(string text)
    {
        try { Clipboard.SetText(text); } catch { }
    }

    static void OpenBrowser(int p, string path)
    {
        try { Process.Start("http://127.0.0.1:" + p + path); } catch { }
    }

    static void ShowAbout()
    {
        MessageBox.Show(
            "Stem Humanize " + version + "\r\n\r\n" +
            "Transient-aware micro-timing and expression effect for rendered stems.\r\n\r\n" +
            "Running locally at http://127.0.0.1:" + port + "/\r\n" +
            "Files: " + webRoot,
            "About Stem Humanize",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }

    static void Shutdown()
    {
        if (shuttingDown) return;
        shuttingDown = true;

        try { if (tray != null) { tray.Visible = false; tray.Dispose(); tray = null; } } catch { }
        try { if (tcp != null) { tcp.Stop(); tcp = null; } } catch { }
        try { if (File.Exists(portFile)) File.Delete(portFile); } catch { }

        Application.Exit();
    }

    static void Cleanup()
    {
        try { if (tray != null) { tray.Visible = false; tray.Dispose(); } } catch { }
        try { if (tcp != null) tcp.Stop(); } catch { }
        try { if (File.Exists(portFile)) File.Delete(portFile); } catch { }
    }

    static void Fail(string message)
    {
        MessageBox.Show(message, "Stem Humanize", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    // ---------------------------------------------------------------- server

    static void ServeLoop()
    {
        while (!shuttingDown)
        {
            TcpClient client;
            try { client = tcp.AcceptTcpClient(); }
            catch { break; }
            ThreadPool.QueueUserWorkItem(HandleClient, client);
        }
    }

    static void HandleClient(object state)
    {
        TcpClient client = (TcpClient)state;
        try
        {
            using (client)
            {
                client.ReceiveTimeout = 5000;
                client.SendTimeout = 10000;
                client.NoDelay = true;

                NetworkStream ns = client.GetStream();
                string requestLine = ReadRequestLine(ns);
                if (requestLine == null) return;

                string[] parts = requestLine.Split(' ');
                if (parts.Length < 2) { WriteText(ns, 400, "Bad Request", "Bad request"); return; }

                string method = parts[0].ToUpperInvariant();
                string rawPath = parts[1];
                bool head = method == "HEAD";

                if (method != "GET" && method != "HEAD")
                {
                    WriteText(ns, 405, "Method Not Allowed", "Method not allowed");
                    return;
                }

                int q = rawPath.IndexOf('?');
                if (q >= 0) rawPath = rawPath.Substring(0, q);
                string path;
                try { path = Uri.UnescapeDataString(rawPath); }
                catch { path = rawPath; }

                if (path == "/api/info" || path == "/api/version")
                {
                    string json = "{\"app\":\"Stem Humanize\",\"version\":\"" + JsonEscape(version) +
                                  "\",\"port\":" + port + "}";
                    WriteBody(ns, 200, "OK", "application/json; charset=utf-8",
                        Encoding.UTF8.GetBytes(json), false);
                    return;
                }

                if (path == "/" || path.Length == 0) path = "/index.html";

                // Resolve safely inside webRoot.
                string rel = path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                string full = Path.GetFullPath(Path.Combine(webRoot, rel));
                string rootFull = Path.GetFullPath(webRoot);
                if (!full.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
                {
                    WriteText(ns, 403, "Forbidden", "Forbidden");
                    return;
                }

                if (Directory.Exists(full))
                {
                    full = Path.Combine(full, "index.html");
                }

                if (!File.Exists(full))
                {
                    WriteText(ns, 404, "Not Found", "Not found: " + path);
                    return;
                }

                byte[] data = File.ReadAllBytes(full);
                WriteBody(ns, 200, "OK", ContentType(Path.GetExtension(full)), data, head);
            }
        }
        catch { }
    }

    static string ReadRequestLine(NetworkStream ns)
    {
        byte[] buffer = new byte[4096];
        MemoryStream ms = new MemoryStream();
        while (ms.Length < 32768)
        {
            int n;
            try { n = ns.Read(buffer, 0, buffer.Length); }
            catch { return null; }
            if (n <= 0) break;
            ms.Write(buffer, 0, n);

            byte[] all = ms.ToArray();
            for (int i = 0; i + 3 < all.Length; i++)
            {
                if (all[i] == 13 && all[i + 1] == 10 && all[i + 2] == 13 && all[i + 3] == 10)
                {
                    string text = Encoding.ASCII.GetString(all, 0, i);
                    int nl = text.IndexOf("\r\n");
                    return nl >= 0 ? text.Substring(0, nl) : text;
                }
            }
        }
        return null;
    }

    static void WriteText(NetworkStream ns, int status, string reason, string message)
    {
        WriteBody(ns, status, reason, "text/plain; charset=utf-8", Encoding.UTF8.GetBytes(message + "\n"), false);
    }

    static void WriteBody(NetworkStream ns, int status, string reason, string contentType, byte[] body, bool head)
    {
        StringBuilder sb = new StringBuilder();
        sb.Append("HTTP/1.1 ").Append(status).Append(' ').Append(reason).Append("\r\n");
        sb.Append("Content-Type: ").Append(contentType).Append("\r\n");
        sb.Append("Content-Length: ").Append(body.Length).Append("\r\n");
        sb.Append("Cache-Control: no-store\r\n");
        sb.Append("X-Content-Type-Options: nosniff\r\n");
        sb.Append("Connection: close\r\n\r\n");

        byte[] header = Encoding.ASCII.GetBytes(sb.ToString());
        ns.Write(header, 0, header.Length);
        if (!head && body.Length > 0) ns.Write(body, 0, body.Length);
        ns.Flush();
    }

    static string ContentType(string ext)
    {
        switch ((ext ?? "").ToLowerInvariant())
        {
            case ".html": case ".htm": return "text/html; charset=utf-8";
            case ".js": case ".mjs": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": return "application/json; charset=utf-8";
            case ".md": case ".txt": return "text/plain; charset=utf-8";
            case ".svg": return "image/svg+xml";
            case ".png": return "image/png";
            case ".ico": return "image/x-icon";
            case ".jpg": case ".jpeg": return "image/jpeg";
            case ".webp": return "image/webp";
            case ".wav": return "audio/wav";
            case ".mp3": return "audio/mpeg";
            case ".ogg": return "audio/ogg";
            case ".woff2": return "font/woff2";
            default: return "application/octet-stream";
        }
    }

    static string JsonEscape(string s)
    {
        if (s == null) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"");
    }
}
