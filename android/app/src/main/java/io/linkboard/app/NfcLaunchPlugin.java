package io.linkboard.app;

import android.content.Intent;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.Ndef;
import android.os.Build;
import android.os.Parcelable;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "NfcLaunch")
public class NfcLaunchPlugin extends Plugin implements NfcAdapter.ReaderCallback {

    private static final String RECORD_TYPE = "application/vnd.linkboard.tag";
    private static final String LOG_TAG = "NfcLaunchPlugin";

    private PluginCall pendingWriteCall;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        NfcAdapter adapter = NfcAdapter.getDefaultAdapter(getContext());
        JSObject result = new JSObject();
        result.put("available", adapter != null && adapter.isEnabled());
        call.resolve(result);
    }

    @PluginMethod
    public synchronized void writeTag(PluginCall call) {
        String linkId = call.getString("linkId");
        if (linkId == null || linkId.trim().isEmpty()) {
            call.reject("Il link non ha un identificativo valido.");
            return;
        }

        NfcAdapter adapter = NfcAdapter.getDefaultAdapter(getContext());
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("NFC non disponibile o disattivato su questo dispositivo.");
            return;
        }
        if (pendingWriteCall != null) {
            call.reject("È già in corso una scrittura NFC.");
            return;
        }

        pendingWriteCall = call;
        getActivity().runOnUiThread(() -> {
            try {
                adapter.enableReaderMode(
                    getActivity(),
                    this,
                    NfcAdapter.FLAG_READER_NFC_A
                        | NfcAdapter.FLAG_READER_NFC_B
                        | NfcAdapter.FLAG_READER_NFC_F
                        | NfcAdapter.FLAG_READER_NFC_V
                        | NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS,
                    null
                );
            } catch (RuntimeException error) {
                String message = error.getMessage();
                finishWrite(call, message == null ? "Impossibile avviare la scansione NFC." : message);
            }
        });
    }

    @PluginMethod
    public void cancelWrite(PluginCall call) {
        PluginCall writeCall;
        synchronized (this) {
            writeCall = pendingWriteCall;
            pendingWriteCall = null;
        }
        disableReaderMode();
        if (writeCall != null) writeCall.reject("Operazione NFC interrotta.", "AbortError");
        call.resolve();
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null || !NfcAdapter.ACTION_NDEF_DISCOVERED.equals(intent.getAction())) return;

        Parcelable[] rawMessages = getParcelableArrayExtra(intent, NfcAdapter.EXTRA_NDEF_MESSAGES);
        if (rawMessages == null) return;

        for (Parcelable rawMessage : rawMessages) {
            if (!(rawMessage instanceof NdefMessage)) continue;
            for (NdefRecord record : ((NdefMessage) rawMessage).getRecords()) {
                if (!RECORD_TYPE.equals(record.toMimeType())) continue;

                String linkId = new String(record.getPayload(), StandardCharsets.UTF_8).trim();
                if (linkId.isEmpty()) return;

                JSObject event = new JSObject();
                event.put("linkId", linkId);
                notifyListeners("tagDetected", event, true);
                return;
            }
        }
    }

    @Override
    public void onTagDiscovered(Tag tag) {
        PluginCall call;
        synchronized (this) {
            call = pendingWriteCall;
        }
        if (call == null) return;

        String errorMessage = null;
        Ndef ndef = Ndef.get(tag);
        if (ndef == null) {
            errorMessage = "Il tag non è compatibile con NDEF.";
        } else {
            try {
                ndef.connect();
                if (!ndef.isWritable()) {
                    errorMessage = "Il tag NFC è in sola lettura.";
                } else {
                    NdefRecord record = NdefRecord.createMime(
                        RECORD_TYPE,
                        call.getString("linkId").getBytes(StandardCharsets.UTF_8)
                    );
                    NdefMessage message = new NdefMessage(new NdefRecord[] { record });
                    if (message.toByteArray().length > ndef.getMaxSize()) {
                        errorMessage = "Il tag NFC non ha spazio sufficiente.";
                    } else {
                        ndef.writeNdefMessage(message);
                    }
                }
            } catch (IOException | android.nfc.FormatException error) {
                errorMessage = "Impossibile scrivere sul tag NFC. Verifica che sia compatibile e riprova.";
            } finally {
                try {
                    ndef.close();
                } catch (IOException error) {
                    android.util.Log.w(LOG_TAG, "Could not close the NFC tag connection.", error);
                }
            }
        }

        finishWrite(call, errorMessage);
    }

    private void finishWrite(PluginCall call, String errorMessage) {
        synchronized (this) {
            if (pendingWriteCall != call) return;
            pendingWriteCall = null;
        }
        disableReaderMode();
        if (errorMessage == null) call.resolve();
        else call.reject(errorMessage);
    }

    private void disableReaderMode() {
        getActivity().runOnUiThread(() -> {
            NfcAdapter adapter = NfcAdapter.getDefaultAdapter(getContext());
            if (adapter != null) adapter.disableReaderMode(getActivity());
        });
    }

    private static Parcelable[] getParcelableArrayExtra(Intent intent, String name) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return intent.getParcelableArrayExtra(name, Parcelable.class);
        }
        return getParcelableArrayExtraLegacy(intent, name);
    }

    @SuppressWarnings("deprecation")
    private static Parcelable[] getParcelableArrayExtraLegacy(Intent intent, String name) {
        return intent.getParcelableArrayExtra(name);
    }
}
