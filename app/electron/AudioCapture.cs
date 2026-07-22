using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace StreamedIO.Audio
{
    [Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioClient
    {
        [PreserveSig] int Initialize(int shareMode, int streamFlags, long hnsBufferDuration, long hnsPeriodicity, IntPtr pFormat, [In] ref Guid AudioSessionGuid);
        [PreserveSig] int GetBufferSize(out uint pNumBufferFrames);
        [PreserveSig] int GetStreamLatency(out long phnsLatency);
        [PreserveSig] int GetCurrentPadding(out uint pNumPaddingFrames);
        [PreserveSig] int IsFormatSupported(int shareMode, IntPtr pFormatEnforced, out IntPtr ppFormatClosestMatch);
        [PreserveSig] int GetMixFormat(out IntPtr ppDeviceFormat);
        [PreserveSig] int GetDevicePeriod(out long phnsDefaultDevicePeriod, out long phnsMinimumDevicePeriod);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr eventHandle);
        [PreserveSig] int GetService([In] ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
    }

    [Guid("C8ADBD64-A71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr pData, out uint pNumFramesToRead, out uint pdwFlags, out ulong pu64DevicePosition, out ulong pu64QPCPosition);
        [PreserveSig] int ReleaseBuffer(uint NumFramesRead);
        [PreserveSig] int GetNextPacketSize(out uint pNumFramesInNextPacket);
    }

    [Guid("41D942BD-95A8-4B3A-B5CF-6450DA216158"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IActivateAudioInterfaceAsyncOperation
    {
        [PreserveSig] int GetActivateResult(out int activateResult, [MarshalAs(UnmanagedType.IUnknown)] out object activateInterface);
    }

    [Guid("94119AF4-70A3-478A-867B-047B2EC739B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IActivateAudioInterfaceCompletionHandler
    {
        [PreserveSig] int ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation);
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct WAVEFORMATEX
    {
        public ushort wFormatTag;
        public ushort nChannels;
        public uint nSamplesPerSec;
        public uint nAvgBytesPerSec;
        public ushort nBlockAlign;
        public ushort wBitsPerSample;
        public ushort cbSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct AUDIOCLIENT_PARAM_PROCESS_LOOPBACK
    {
        public uint TargetProcessId;
        public uint ProcessLoopbackMode;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct BLOB
    {
        public uint cbSize;
        public IntPtr pBlobData;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct PROPVARIANT
    {
        [FieldOffset(0)]
        public ushort vt;
        [FieldOffset(2)]
        public ushort wReserved1;
        [FieldOffset(4)]
        public ushort wReserved2;
        [FieldOffset(6)]
        public ushort wReserved3;
        [FieldOffset(8)]
        public BLOB blob;
    }

    class AudioCaptureHandler : IActivateAudioInterfaceCompletionHandler
    {
        public AutoResetEvent CompletedEvent = new AutoResetEvent(false);
        public int ActivateResult = -1;
        public object ActivatedInterface = null;

        public int ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation)
        {
            activateOperation.GetActivateResult(out ActivateResult, out ActivatedInterface);
            CompletedEvent.Set();
            return 0;
        }
    }

    class Program
    {
        [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = false)]
        public static extern void ActivateAudioInterfaceAsync(
            [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
            [In] ref Guid riid,
            [In] ref PROPVARIANT activationParams,
            [In] IActivateAudioInterfaceCompletionHandler completionHandler,
            out IActivateAudioInterfaceAsyncOperation activationOperation);

        public static readonly Guid IID_IAudioClient = new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");
        public static readonly Guid IID_IAudioCaptureClient = new Guid("C8ADBD64-A71E-48a0-A4DE-185C395CD317");

        static void Main(string[] args)
        {
            uint pid;
            if (args.Length < 1 || !uint.TryParse(args[0], out pid))
            {
                Console.Error.WriteLine("Usage: AudioCapture.exe <PID>");
                return;
            }

            try
            {
                AUDIOCLIENT_PARAM_PROCESS_LOOPBACK loopbackParams = new AUDIOCLIENT_PARAM_PROCESS_LOOPBACK
                {
                    TargetProcessId = pid,
                    ProcessLoopbackMode = 0 // INCLUDE_TARGET_PROCESS_TREE
                };

                IntPtr paramsPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(AUDIOCLIENT_PARAM_PROCESS_LOOPBACK)));
                Marshal.StructureToPtr(loopbackParams, paramsPtr, false);

                PROPVARIANT propVariant = new PROPVARIANT();
                propVariant.vt = 65; // VT_BLOB
                propVariant.blob.cbSize = (uint)Marshal.SizeOf(typeof(AUDIOCLIENT_PARAM_PROCESS_LOOPBACK));
                propVariant.blob.pBlobData = paramsPtr;

                AudioCaptureHandler handler = new AudioCaptureHandler();
                Guid iidAudioClient = IID_IAudioClient;

                // VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK
                string DEVINTERFACE_AUDIO_RENDER = "{e6321be6-9e38-49e0-9416-3a7267c01cd9}";
                IActivateAudioInterfaceAsyncOperation asyncOp;

                ActivateAudioInterfaceAsync(DEVINTERFACE_AUDIO_RENDER, ref iidAudioClient, ref propVariant, handler, out asyncOp);

                handler.CompletedEvent.WaitOne(5000);
                Marshal.FreeHGlobal(paramsPtr);

                if (handler.ActivateResult != 0 || handler.ActivatedInterface == null)
                {
                    Console.Error.WriteLine("Failed to activate WASAPI process loopback for PID: " + pid + " (HR: 0x" + handler.ActivateResult.ToString("X") + ")");
                    return;
                }

                IAudioClient audioClient = (IAudioClient)handler.ActivatedInterface;
                IntPtr pFormat;
                audioClient.GetMixFormat(out pFormat);
                WAVEFORMATEX wf = (WAVEFORMATEX)Marshal.PtrToStructure(pFormat, typeof(WAVEFORMATEX));

                Guid sessionGuid = Guid.Empty;
                // AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000
                int hr = audioClient.Initialize(0, 0x00020000, 10000000, 0, pFormat, ref sessionGuid);
                if (hr < 0)
                {
                    Console.Error.WriteLine("Failed to initialize audio client: 0x" + hr.ToString("X"));
                    return;
                }

                Guid captureClientIid = IID_IAudioCaptureClient;
                object captureClientObj;
                audioClient.GetService(ref captureClientIid, out captureClientObj);
                IAudioCaptureClient captureClient = (IAudioCaptureClient)captureClientObj;

                audioClient.Start();
                Console.Error.WriteLine("WASAPI Process Loopback started for PID " + pid + " (" + wf.nSamplesPerSec + "Hz, " + wf.nChannels + "ch, " + wf.wBitsPerSample + "bit)");

                Stream stdout = Console.OpenStandardOutput();
                byte[] buffer = new byte[8192];
                uint packetSize;
                IntPtr pData;
                uint numFrames;
                uint flags;
                ulong devPos;
                ulong qpcPos;

                while (true)
                {
                    captureClient.GetNextPacketSize(out packetSize);
                    while (packetSize > 0)
                    {
                        captureClient.GetBuffer(out pData, out numFrames, out flags, out devPos, out qpcPos);
                        if (numFrames > 0 && pData != IntPtr.Zero)
                        {
                            int bytesToRead = (int)(numFrames * wf.nBlockAlign);
                            if (buffer.Length < bytesToRead) buffer = new byte[bytesToRead];
                            Marshal.Copy(pData, buffer, 0, bytesToRead);
                            stdout.Write(buffer, 0, bytesToRead);
                            stdout.Flush();
                        }
                        captureClient.ReleaseBuffer(numFrames);
                        captureClient.GetNextPacketSize(out packetSize);
                    }
                    Thread.Sleep(10);
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("AudioCapture Error: " + ex.Message);
            }
        }
    }
}
