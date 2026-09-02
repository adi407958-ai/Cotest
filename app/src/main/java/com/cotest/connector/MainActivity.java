package com.cotest.connector;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.*;

public class MainActivity extends Activity {
    private EditText address;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(32, 40, 32, 24); root.setBackgroundColor(Color.rgb(12,18,28));
        TextView title = new TextView(this); title.setText("Cotest Connect"); title.setTextColor(Color.WHITE); title.setTextSize(26); root.addView(title, new LinearLayout.LayoutParams(-1, -2));
        TextView hint = new TextView(this); hint.setText("Workflow çıktısındaki Tailscale IP adresini girin"); hint.setTextColor(Color.LTGRAY); hint.setPadding(0, 8, 0, 24); root.addView(hint);
        address = new EditText(this); address.setHint("100.x.x.x veya cb-node"); address.setTextColor(Color.WHITE); address.setHintTextColor(Color.GRAY); address.setSingleLine(true); root.addView(address, new LinearLayout.LayoutParams(-1, -2));
        Button connect = new Button(this); connect.setText("Bağlan"); root.addView(connect, new LinearLayout.LayoutParams(-1, -2));
        connect.setOnClickListener(v -> open());
        setContentView(root);
    }
    private void open() {
        String host = address.getText().toString().trim();
        if (host.isEmpty()) { address.setError("IP adresi gerekli"); return; }
        if (host.startsWith("http://")) host = host.substring(7); if (host.endsWith("/")) host = host.substring(0, host.length()-1);
        WebView web = new WebView(this); web.setWebViewClient(new WebViewClient()); web.getSettings().setJavaScriptEnabled(true); web.getSettings().setDomStorageEnabled(true); web.loadUrl("http://" + host + ":5050"); setContentView(web);
    }
}
