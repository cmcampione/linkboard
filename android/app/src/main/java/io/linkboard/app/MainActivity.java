package io.linkboard.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(NfcLaunchPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
