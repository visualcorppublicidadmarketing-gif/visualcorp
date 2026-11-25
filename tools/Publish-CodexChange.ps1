#Requires -Version 7.4
#Requires -PSEdition Core
<#
.SYNOPSIS
    Stores or uses the one-purpose HMAC credential for Codex changelog publishing.
.DESCRIPTION
    -Initialize generates a 256-bit HMAC secret, stores it in Windows Credential Manager,
    and copies it to the clipboard for one-time entry in Supabase Edge Function secrets.
    -Publish signs a request locally and publishes only a new entry for the Visual Corp org.
.EXAMPLE
    pwsh -File tools/Publish-CodexChange.ps1 -Initialize -Confirm:$false
.EXAMPLE
    pwsh -File tools/Publish-CodexChange.ps1 -Publish -Title 'Navegación actualizada' -Summary '...' -Details '...' -Confirm:$false
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Initialize')]
    [switch] $Initialize,

    [Parameter(Mandatory, ParameterSetName = 'Publish')]
    [switch] $Publish,

    [Parameter(Mandatory, ParameterSetName = 'Publish')]
    [ValidateLength(3, 160)]
    [string] $Title,

    [Parameter(Mandatory, ParameterSetName = 'Publish')]
    [ValidateLength(3, 500)]
    [string] $Summary,

    [Parameter(ParameterSetName = 'Publish')]
    [AllowEmptyString()]
    [ValidateLength(0, 10000)]
    [string] $Details = '',

    [Parameter(ParameterSetName = 'Publish')]
    [ValidateSet('general', 'website', 'sales', 'inventory', 'operations', 'security')]
    [string] $Category = 'website',

    [Parameter(ParameterSetName = 'Publish')]
    [ValidateSet('both', 'admin', 'operations')]
    [string] $Audience = 'both',

    [Parameter(ParameterSetName = 'Publish')]
    [ValidateLength(0, 80)]
    [string] $VersionTag = '',

    [Parameter(ParameterSetName = 'Publish')]
    [ValidateCount(0, 7)]
    [string[]] $Tags = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $IsWindows) {
    throw 'This helper uses Windows Credential Manager and must run in PowerShell 7 on Windows.'
}

if (-not ('VisualCorp.Tools.CredentialStore' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Security;
using System.Text;

namespace VisualCorp.Tools {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal struct NativeCredential {
        public UInt32 Flags;
        public UInt32 Type;
        public IntPtr TargetName;
        public IntPtr Comment;
        public FILETIME LastWritten;
        public UInt32 CredentialBlobSize;
        public IntPtr CredentialBlob;
        public UInt32 Persist;
        public UInt32 AttributeCount;
        public IntPtr Attributes;
        public IntPtr TargetAlias;
        public IntPtr UserName;
    }

    public static class CredentialStore {
        private const UInt32 GenericType = 1;
        private const UInt32 PersistLocalMachine = 2;
        private const Int32 NotFound = 1168;

        [DllImport("Advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CredWrite(ref NativeCredential credential, UInt32 flags);

        [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CredRead(String target, UInt32 type, UInt32 reservedFlag, out IntPtr credential);

        [DllImport("Advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CredDelete(String target, UInt32 type, UInt32 flags);

        [DllImport("Advapi32.dll", EntryPoint = "CredFree")]
        private static extern void CredFree(IntPtr buffer);

        public static String Read(String target) {
            IntPtr buffer;
            if (!CredRead(target, GenericType, 0, out buffer)) {
                Int32 error = Marshal.GetLastWin32Error();
                if (error == NotFound) return null;
                throw new Win32Exception(error);
            }

            try {
                NativeCredential credential = Marshal.PtrToStructure<NativeCredential>(buffer);
                Int32 length = checked((Int32)credential.CredentialBlobSize);
                if (length == 0 || length % 2 != 0) return null;
                Byte[] bytes = new Byte[length];
                Marshal.Copy(credential.CredentialBlob, bytes, 0, length);
                try { return Encoding.Unicode.GetString(bytes); }
                finally { Array.Clear(bytes, 0, bytes.Length); }
            }
            finally { CredFree(buffer); }
        }

        public static void Write(String target, String userName, SecureString secret) {
            IntPtr targetPointer = IntPtr.Zero;
            IntPtr userPointer = IntPtr.Zero;
            IntPtr secretPointer = IntPtr.Zero;
            try {
                targetPointer = Marshal.StringToCoTaskMemUni(target);
                userPointer = Marshal.StringToCoTaskMemUni(userName);
                secretPointer = Marshal.SecureStringToGlobalAllocUnicode(secret);
                NativeCredential credential = new NativeCredential {
                    Flags = 0,
                    Type = GenericType,
                    TargetName = targetPointer,
                    Comment = IntPtr.Zero,
                    CredentialBlobSize = checked((UInt32)(secret.Length * 2)),
                    CredentialBlob = secretPointer,
                    Persist = PersistLocalMachine,
                    AttributeCount = 0,
                    Attributes = IntPtr.Zero,
                    TargetAlias = IntPtr.Zero,
                    UserName = userPointer
                };
                if (!CredWrite(ref credential, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
            }
            finally {
                if (secretPointer != IntPtr.Zero) Marshal.ZeroFreeGlobalAllocUnicode(secretPointer);
                if (targetPointer != IntPtr.Zero) Marshal.FreeCoTaskMem(targetPointer);
                if (userPointer != IntPtr.Zero) Marshal.FreeCoTaskMem(userPointer);
            }
        }

        public static void Delete(String target) {
            if (!CredDelete(target, GenericType, 0)) {
                Int32 error = Marshal.GetLastWin32Error();
                if (error != NotFound) throw new Win32Exception(error);
            }
        }
    }
}
'@
}

$credentialTarget = 'VisualCorpSuite:CodexChangelogPublisher'
$credentialUser = 'codex-changelog'
$projectUrl = 'https://iomdmclkimfmvlzcrkyz.supabase.co'
$publishableKey = 'sb_publishable_3NXz4lgwzTae9dC2S5NMLA_EOFQedMc'
$endpoint = "$projectUrl/functions/v1/codex-changelog"
$utf8 = [System.Text.UTF8Encoding]::new($false)

if ($Initialize) {
    if ([VisualCorp.Tools.CredentialStore]::Read($credentialTarget)) {
        throw 'A local publisher credential already exists. Rotate the Supabase secret and local credential together before replacing it.'
    }

    $randomBytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $secret = [Convert]::ToHexString($randomBytes).ToLowerInvariant()
    [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($randomBytes)
    $secureSecret = ConvertTo-SecureString -String $secret -AsPlainText -Force

    try {
        if ($PSCmdlet.ShouldProcess('Windows Credential Manager and clipboard', 'Create the Codex changelog credential')) {
            [VisualCorp.Tools.CredentialStore]::Write($credentialTarget, $credentialUser, $secureSecret)
            try {
                Set-Clipboard -Value $secret
            }
            catch {
                [VisualCorp.Tools.CredentialStore]::Delete($credentialTarget)
                throw 'Could not copy the new credential. The local credential was removed; try again after checking clipboard access.'
            }

            [pscustomobject]@{
                State = 'credential-created'
                LocalStorage = 'Windows Credential Manager'
                Clipboard = 'One-time HMAC value copied without printing it'
                SupabaseSecretName = 'CODEX_CHANGELOG_HMAC_SECRET'
                NextStep = 'Paste the clipboard value into Supabase Project Settings > Edge Functions > Secrets.'
            }
        }
        else {
            [pscustomobject]@{
                State = 'what-if'
                LocalStorage = 'No changes made'
                SupabaseSecretName = 'CODEX_CHANGELOG_HMAC_SECRET'
            }
        }
    }
    finally {
        $secureSecret.Dispose()
        $secret = $null
    }

    return
}

if ($Publish) {
    if ($Tags.Count -gt 7) {
        throw 'Use no more than seven custom tags; the publisher adds the Codex source tag.'
    }

    $secret = [VisualCorp.Tools.CredentialStore]::Read($credentialTarget)
    if (-not $secret -or $secret -notmatch '^[a-f0-9]{64}$') {
        throw 'No valid local publisher credential was found. Run this script with -Initialize and add that value to the Supabase Edge Function secret first.'
    }

    if (-not $PSCmdlet.ShouldProcess($endpoint, "Publish '$Title' to the Visual Corp changelog")) {
        return [pscustomobject]@{ State = 'what-if'; Endpoint = $endpoint; Title = $Title }
    }

    $payload = [ordered]@{
        id = [guid]::NewGuid().ToString()
        title = $Title.Trim()
        summary = $Summary.Trim()
        details = $Details.Trim()
        category = $Category
        audience = $Audience
        version_tag = $VersionTag.Trim()
        tags = @($Tags | ForEach-Object { $_.Trim() })
    }
    $body = $payload | ConvertTo-Json -Depth 5 -Compress
    $bodyBytes = $utf8.GetBytes($body)
    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString([Globalization.CultureInfo]::InvariantCulture)
    $prefixBytes = [System.Text.Encoding]::ASCII.GetBytes("$timestamp.")
    $messageBytes = [byte[]]::new($prefixBytes.Length + $bodyBytes.Length)
    [Buffer]::BlockCopy($prefixBytes, 0, $messageBytes, 0, $prefixBytes.Length)
    [Buffer]::BlockCopy($bodyBytes, 0, $messageBytes, $prefixBytes.Length, $bodyBytes.Length)
    $secretBytes = $utf8.GetBytes($secret)
    $hmac = [System.Security.Cryptography.HMACSHA256]::new($secretBytes)

    try {
        $signature = [Convert]::ToHexString($hmac.ComputeHash($messageBytes)).ToLowerInvariant()
        $headers = @{
            apikey = $publishableKey
            'x-vc-timestamp' = $timestamp
            'x-vc-signature' = $signature
        }

        try {
            $result = Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bodyBytes -TimeoutSec 30 -ErrorAction Stop
            [pscustomobject]@{
                State = if ($result.duplicate) { 'already-published' } else { 'published' }
                Id = $result.id
                Status = $result.status
                PublishedAt = $result.published_at
                SourceTag = 'Codex'
            }
        }
        catch {
            $statusCode = 0
            try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { }
            if ($statusCode -eq 401) {
                throw 'Publisher rejected the request. Check the Supabase secret and the Windows clock; no credential value was printed.'
            }
            if ($statusCode -eq 503) {
                throw 'The publisher is unavailable or not configured. Check CODEX_CHANGELOG_HMAC_SECRET and Supabase Edge Function logs.'
            }
            if ($statusCode -gt 0) {
                throw "Publication failed with HTTP $statusCode. No credential value was printed."
            }
            throw 'Publication failed before a response was received. No credential value was printed.'
        }
    }
    finally {
        $hmac.Dispose()
        [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($secretBytes)
        [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($messageBytes)
        [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($bodyBytes)
        $secret = $null
    }
}
