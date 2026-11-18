using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Getmeair Setup")]
[assembly: AssemblyDescription("Installer for Getmeair Desktop messenger")]
[assembly: AssemblyCompany("Getmeair")]
[assembly: AssemblyProduct("Getmeair")]
[assembly: AssemblyCopyright("Copyright (C) Getmeair 2014-2026")]
[assembly: AssemblyVersion("7.4.4.0")]
[assembly: AssemblyFileVersion("7.4.4.0")]

namespace GetmeairInstaller
{
    internal static class Program
    {
        private const string AppName = "Getmeair";
        private const string AppVersion = "7.4.4";
        private const string ResourceName = "GetmeairPayload";
        private const string ProtocolKey = @"Software\Classes\getmeair";
        private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Getmeair";
        private const string DataFolderName = "Getmeair";
        private const string StartMenuFolderName = "Getmeair";

        private static string LogPath
        {
            get { return Path.Combine(Path.GetTempPath(), "getmeair-installer.log"); }
        }

        [STAThread]
        private static int Main(string[] args)
        {
            bool silent = false;
            try
            {
                string customDir = null;
                foreach (string arg in args)
                {
                    if (String.IsNullOrEmpty(arg)) continue;
                    string lower = arg.ToLowerInvariant();
                    if (lower == "/s" || lower == "-s" || lower == "--silent" || lower == "/silent")
                    {
                        silent = true;
                    }
                    else if (lower == "/u" || lower == "-u" || lower == "--uninstall"
                        || lower == "/uninstall" || lower == "-uninstall")
                    {
                        return Uninstall(true);
                    }
                    else if (lower.StartsWith("/d=") || lower.StartsWith("-d="))
                    {
                        customDir = arg.Substring(3);
                    }
                }

                if (silent)
                {
                    return Install(true, customDir, true, false);
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                using (SetupForm form = new SetupForm(customDir))
                {
                    if (form.ShowDialog() != DialogResult.OK) return 0;
                    return Install(false, form.InstallPath, form.CreateDesktopShortcut, form.LaunchAfterInstall);
                }
            }
            catch (Exception ex)
            {
                string message = ex.ToString();
                try { File.WriteAllText(LogPath, message); } catch { }
                if (silent) return 1;
                MessageBox.Show(message, "Getmeair Setup failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }

        private static string DefaultInstallPath()
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                AppName);
        }

        private static int Install(bool silent, string installPath, bool desktopShortcut, bool launchAfter)
        {
            if (String.IsNullOrWhiteSpace(installPath)) installPath = DefaultInstallPath();
            installPath = Path.GetFullPath(installPath);
            string temp = ExtractPayload();
            try
            {
                Directory.CreateDirectory(installPath);
                string exePath = Path.Combine(installPath, AppName + ".exe");
                File.Copy(Path.Combine(temp, AppName + ".exe"), exePath, true);

                string sourceModules = Path.Combine(temp, "modules");
                string targetModules = Path.Combine(installPath, "modules");
                if (Directory.Exists(sourceModules))
                {
                    CopyDirectory(sourceModules, targetModules);
                }

                string startMenu = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),
                    "Programs",
                    StartMenuFolderName);
                Directory.CreateDirectory(startMenu);
                CreateShortcut(
                    Path.Combine(startMenu, AppName + ".lnk"),
                    exePath,
                    "",
                    exePath,
                    "Getmeair Desktop messenger");
                CreateShortcut(
                    Path.Combine(startMenu, "Uninstall Getmeair.lnk"),
                    Assembly.GetExecutingAssembly().Location,
                    "/uninstall",
                    Assembly.GetExecutingAssembly().Location,
                    "Remove Getmeair");

                if (desktopShortcut)
                {
                    CreateShortcut(
                        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), AppName + ".lnk"),
                        exePath,
                        "",
                        exePath,
                        "Getmeair Desktop messenger");
                }

                RegisterProtocol(exePath);
                WriteUninstallKey(exePath, installPath);

                string dataPath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    DataFolderName);
                Directory.CreateDirectory(dataPath);

                if (launchAfter)
                {
                    Process.Start(exePath);
                }

                if (!silent)
                {
                    MessageBox.Show(
                        "Getmeair has been installed to:\n" + installPath,
                        "Getmeair Setup",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                }
                return 0;
            }
            finally
            {
                SafeDeleteDirectory(temp);
            }
        }

        private static int Uninstall(bool silent)
        {
            string installPath = ReadInstallPath();
            if (String.IsNullOrWhiteSpace(installPath)) installPath = DefaultInstallPath();
            installPath = Path.GetFullPath(installPath);

            SafeDeleteFile(Path.Combine(installPath, AppName + ".exe"));
            SafeDeleteDirectory(Path.Combine(installPath, "modules"));
            SafeDeleteFile(Path.Combine(installPath, "PORTABLE.txt"));
            try { if (Directory.Exists(installPath)) Directory.Delete(installPath, false); } catch { }

            string startMenu = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),
                "Programs",
                StartMenuFolderName);
            SafeDeleteFile(Path.Combine(startMenu, AppName + ".lnk"));
            SafeDeleteFile(Path.Combine(startMenu, "Uninstall Getmeair.lnk"));
            try { if (Directory.Exists(startMenu)) Directory.Delete(startMenu, false); } catch { }

            SafeDeleteFile(Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                AppName + ".lnk"));

            try { Registry.CurrentUser.DeleteSubKeyTree(ProtocolKey, false); } catch { }
            try { Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false); } catch { }

            if (!silent)
            {
                MessageBox.Show(
                    "Getmeair has been removed. Your messages and settings in %APPDATA%\\Getmeair were kept.",
                    "Getmeair Setup",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
            return 0;
        }

        private static string ExtractPayload()
        {
            string temp = Path.Combine(Path.GetTempPath(), "getmeair-payload-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(temp);
            string zip = Path.Combine(temp, "payload.zip");
            using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName))
            {
                if (resource == null)
                {
                    throw new InvalidOperationException("Embedded Getmeair payload was not found.");
                }
                using (FileStream file = File.Create(zip))
                {
                    resource.CopyTo(file);
                }
            }

            string tar = Path.Combine(Environment.SystemDirectory, "tar.exe");
            if (!File.Exists(tar))
            {
                throw new FileNotFoundException("Windows tar.exe is required to unpack the installer payload.", tar);
            }

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = tar;
            psi.Arguments = "-xf \"" + zip + "\" -C \"" + temp + "\"";
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            using (Process process = Process.Start(psi))
            {
                process.WaitForExit();
                if (process.ExitCode != 0)
                {
                    throw new InvalidOperationException("Payload extraction failed with exit code " + process.ExitCode + ".");
                }
            }
            SafeDeleteFile(zip);
            return temp;
        }

        private static void CopyDirectory(string source, string target)
        {
            Directory.CreateDirectory(target);
            foreach (string file in Directory.GetFiles(source))
            {
                File.Copy(file, Path.Combine(target, Path.GetFileName(file)), true);
            }
            foreach (string dir in Directory.GetDirectories(source))
            {
                CopyDirectory(dir, Path.Combine(target, Path.GetFileName(dir)));
            }
        }

        private static void CreateShortcut(string path, string target, string arguments, string icon, string description)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) throw new InvalidOperationException("WScript.Shell is unavailable.");
            object shell = Activator.CreateInstance(shellType);
            object link = shellType.InvokeMember("CreateShortcut",
                BindingFlags.InvokeMethod, null, shell, new object[] { path });
            Type linkType = link.GetType();
            linkType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, link, new object[] { target });
            linkType.InvokeMember("Arguments", BindingFlags.SetProperty, null, link, new object[] { arguments });
            linkType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, link,
                new object[] { Path.GetDirectoryName(target) });
            linkType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, link, new object[] { icon + ",0" });
            linkType.InvokeMember("Description", BindingFlags.SetProperty, null, link, new object[] { description });
            linkType.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, null);
        }

        private static void RegisterProtocol(string exePath)
        {
            using (RegistryKey root = Registry.CurrentUser.CreateSubKey(ProtocolKey))
            {
                root.SetValue("", "URL:Getmeair Protocol", RegistryValueKind.String);
                root.SetValue("URL Protocol", "", RegistryValueKind.String);
            }
            using (RegistryKey command = Registry.CurrentUser.CreateSubKey(ProtocolKey + @"\shell\open\command"))
            {
                command.SetValue("", "\"" + exePath + "\" \"%1\"", RegistryValueKind.String);
            }
        }

        private static void WriteUninstallKey(string exePath, string installPath)
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallKey))
            {
                key.SetValue("DisplayName", "Getmeair", RegistryValueKind.String);
                key.SetValue("DisplayVersion", AppVersion, RegistryValueKind.String);
                key.SetValue("DisplayIcon", exePath, RegistryValueKind.String);
                key.SetValue("Publisher", "Getmeair", RegistryValueKind.String);
                key.SetValue("URLInfoAbout", "https://getmeair.com", RegistryValueKind.String);
                key.SetValue("InstallLocation", installPath, RegistryValueKind.String);
                key.SetValue("UninstallString", "\"" + Assembly.GetExecutingAssembly().Location + "\" /uninstall", RegistryValueKind.String);
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }

        private static string ReadInstallPath()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(UninstallKey))
                {
                    if (key == null) return null;
                    return key.GetValue("InstallLocation") as string;
                }
            }
            catch { return null; }
        }

        private static void SafeDeleteFile(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); } catch { }
        }

        private static void SafeDeleteDirectory(string path)
        {
            try { if (Directory.Exists(path)) Directory.Delete(path, true); } catch { }
        }
    }

    internal class SetupForm : Form
    {
        private readonly TextBox pathBox = new TextBox();
        private readonly CheckBox desktopBox = new CheckBox();
        private readonly CheckBox launchBox = new CheckBox();
        private readonly Button installButton = new Button();
        private readonly Button cancelButton = new Button();

        public string InstallPath { get { return pathBox.Text.Trim(); } }
        public bool CreateDesktopShortcut { get { return desktopBox.Checked; } }
        public bool LaunchAfterInstall { get { return launchBox.Checked; } }

        public SetupForm(string customPath)
        {
            Text = "Getmeair Setup";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(470, 255);
            try { Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location); } catch { }

            Label title = new Label();
            title.Text = "Getmeair Desktop";
            title.Font = new Font(Font.FontFamily, 16f, FontStyle.Bold);
            title.Location = new Point(22, 18);
            title.Size = new Size(420, 30);
            Controls.Add(title);

            Label info = new Label();
            info.Text = "Install the standalone Getmeair messenger.\nOfficial Telegram API infrastructure is used; no Telegram Desktop data is touched.";
            info.Location = new Point(22, 52);
            info.Size = new Size(420, 40);
            Controls.Add(info);

            Label pathLabel = new Label();
            pathLabel.Text = "Install folder:";
            pathLabel.Location = new Point(22, 102);
            pathLabel.Size = new Size(100, 20);
            Controls.Add(pathLabel);

            pathBox.Location = new Point(22, 122);
            pathBox.Size = new Size(420, 24);
            pathBox.Text = String.IsNullOrWhiteSpace(customPath)
                ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Getmeair")
                : customPath;
            Controls.Add(pathBox);

            desktopBox.Text = "Create desktop shortcut";
            desktopBox.Checked = true;
            desktopBox.Location = new Point(22, 158);
            desktopBox.Size = new Size(200, 22);
            Controls.Add(desktopBox);

            launchBox.Text = "Launch Getmeair after installation";
            launchBox.Checked = false;
            launchBox.Location = new Point(22, 182);
            launchBox.Size = new Size(280, 22);
            Controls.Add(launchBox);

            installButton.Text = "Install";
            installButton.Location = new Point(270, 215);
            installButton.Size = new Size(90, 28);
            installButton.DialogResult = DialogResult.OK;
            Controls.Add(installButton);

            cancelButton.Text = "Cancel";
            cancelButton.Location = new Point(370, 215);
            cancelButton.Size = new Size(72, 28);
            cancelButton.DialogResult = DialogResult.Cancel;
            Controls.Add(cancelButton);

            AcceptButton = installButton;
            CancelButton = cancelButton;
        }
    }
}
