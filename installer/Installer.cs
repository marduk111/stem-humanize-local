// Stem Humanize installer.
// Single-file, dependency-free: extracts the embedded payload zip into
// %LOCALAPPDATA%\StemHumanize, creates shortcuts, registers an uninstaller,
// then launches the app.

using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

static class Program
{
    const string AppName = "Stem Humanize";
    const string Version = "__VERSION__";
    const string ExeName = "StemHumanizeServer.exe";

    static string target;
    static string exePath;

    internal static string VersionText { get { return Version; } }
    internal static string InstalledExe { get { return exePath; } }

    [STAThread]
    static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        target = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "StemHumanize");
        exePath = Path.Combine(target, ExeName);

        bool silent = args != null && Array.IndexOf(args, "--silent") >= 0;

        if (!silent)
        {
            DialogResult answer = MessageBox.Show(
                "Install " + AppName + " " + Version + "?\n\n" +
                "Location: " + target + "\n\n" +
                "This creates a Desktop shortcut and a Start Menu entry.",
                AppName + " Setup",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);

            if (answer != DialogResult.Yes) return;
        }

        Application.Run(new InstallForm());
    }

    internal static bool RunInstall()
    {
        try
        {
            KillRunning();

            // Replace the old copy but keep any future user data folder intact.
            Directory.CreateDirectory(target);
            ExtractPayload();
            WriteUninstaller();
            CreateShortcuts();
            RegisterUninstall();
            return true;
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Installation failed:\n\n" + ex.Message,
                AppName + " Setup",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return false;
        }
    }

    static void KillRunning()
    {
        try
        {
            foreach (Process p in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(ExeName)))
            {
                try { p.Kill(); p.WaitForExit(3000); } catch { }
            }
        }
        catch { }
    }

    static void ExtractPayload()
    {
        Assembly asm = Assembly.GetExecutingAssembly();
        using (Stream stream = asm.GetManifestResourceStream("Payload.zip"))
        {
            if (stream == null) throw new InvalidOperationException("Installer payload is missing.");
            using (ZipArchive zip = new ZipArchive(stream, ZipArchiveMode.Read))
            {
                foreach (ZipArchiveEntry entry in zip.Entries)
                {
                    string name = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                    string dest = Path.GetFullPath(Path.Combine(target, name));

                    if (!dest.StartsWith(Path.GetFullPath(target), StringComparison.OrdinalIgnoreCase))
                        throw new InvalidOperationException("Invalid archive entry: " + entry.FullName);

                    if (entry.FullName.EndsWith("/"))
                    {
                        Directory.CreateDirectory(dest);
                        continue;
                    }

                    string dir = Path.GetDirectoryName(dest);
                    if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

                    // Keep an existing settings file if one is ever added.
                    if (File.Exists(dest) && Path.GetFileName(dest).Equals("settings.json", StringComparison.OrdinalIgnoreCase))
                        continue;

                    entry.ExtractToFile(dest, true);
                }
            }
        }
    }

    static void WriteUninstaller()
    {
        string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        string programs = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
        string psTarget = target.Replace("'", "''");

        StringBuilder sb = new StringBuilder();
        sb.AppendLine("@echo off");
        sb.AppendLine("taskkill /IM " + ExeName + " /F >nul 2>nul");
        sb.AppendLine("reg delete \"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\StemHumanize\" /f >nul 2>nul");
        sb.AppendLine("del \"" + Path.Combine(desktop, AppName + ".lnk") + "\" >nul 2>nul");
        sb.AppendLine("del \"" + Path.Combine(programs, AppName + ".lnk") + "\" >nul 2>nul");
        sb.AppendLine("del \"" + Path.Combine(programs, "Uninstall " + AppName + ".lnk") + "\" >nul 2>nul");
        sb.AppendLine("start \"\" /min powershell -NoProfile -WindowStyle Hidden -Command \"Start-Sleep -Seconds 2; " +
                      "Remove-Item -LiteralPath '" + psTarget + "' -Recurse -Force -ErrorAction SilentlyContinue\"");
        sb.AppendLine("exit /b 0");

        File.WriteAllText(Path.Combine(target, "Uninstall.cmd"), sb.ToString(), Encoding.ASCII);
    }

    static void CreateShortcuts()
    {
        string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        string programs = Environment.GetFolderPath(Environment.SpecialFolder.Programs);

        CreateShortcut(Path.Combine(desktop, AppName + ".lnk"), exePath, target,
            "Stem Humanize \u2014 humanize rendered stems");
        CreateShortcut(Path.Combine(programs, AppName + ".lnk"), exePath, target,
            "Stem Humanize \u2014 humanize rendered stems");
        CreateShortcut(Path.Combine(programs, "Uninstall " + AppName + ".lnk"),
            Path.Combine(target, "Uninstall.cmd"), target, "Uninstall Stem Humanize");
    }

    static void CreateShortcut(string linkPath, string targetPath, string workingDir, string description)
    {
        try
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) return;
            object shell = Activator.CreateInstance(shellType);
            object shortcut = shellType.InvokeMember("CreateShortcut",
                System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { linkPath });

            Type linkType = shortcut.GetType();
            linkType.InvokeMember("TargetPath", System.Reflection.BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
            linkType.InvokeMember("WorkingDirectory", System.Reflection.BindingFlags.SetProperty, null, shortcut, new object[] { workingDir });
            linkType.InvokeMember("IconLocation", System.Reflection.BindingFlags.SetProperty, null, shortcut, new object[] { targetPath + ",0" });
            linkType.InvokeMember("Description", System.Reflection.BindingFlags.SetProperty, null, shortcut, new object[] { description });
            linkType.InvokeMember("Save", System.Reflection.BindingFlags.InvokeMethod, null, shortcut, null);
        }
        catch { /* shortcuts are a convenience, not a requirement */ }
    }

    static void RegisterUninstall()
    {
        try
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Uninstall\StemHumanize"))
            {
                if (key == null) return;
                key.SetValue("DisplayName", AppName);
                key.SetValue("DisplayVersion", Version);
                key.SetValue("Publisher", "Stem Humanize");
                key.SetValue("InstallLocation", target);
                key.SetValue("DisplayIcon", exePath + ",0");
                key.SetValue("UninstallString", "cmd /c \"\"" + Path.Combine(target, "Uninstall.cmd") + "\"\"");
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }
        catch { }
    }
}

internal sealed class InstallForm : Form
{
    private readonly Label label;
    private readonly ProgressBar bar;

    internal InstallForm()
    {
        Text = "Stem Humanize Setup";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterScreen;
        MaximizeBox = false;
        MinimizeBox = false;
        ClientSize = new Size(430, 110);
        BackColor = Color.FromArgb(24, 26, 30);
        ForeColor = Color.FromArgb(225, 228, 234);

        label = new Label();
        label.Text = "Installing Stem Humanize " + Program.VersionText + "\u2026";
        label.AutoSize = false;
        label.SetBounds(18, 18, 394, 22);
        Controls.Add(label);

        bar = new ProgressBar();
        bar.Style = ProgressBarStyle.Marquee;
        bar.MarqueeAnimationSpeed = 30;
        bar.SetBounds(18, 52, 394, 18);
        Controls.Add(bar);

        Shown += delegate { BeginInstall(); };
    }

    private void BeginInstall()
    {
        Application.DoEvents();
        bool ok = Program.RunInstall();
        if (!ok) { Close(); return; }

        try { Process.Start(Program.InstalledExe); } catch { }
        Close();
    }
}
