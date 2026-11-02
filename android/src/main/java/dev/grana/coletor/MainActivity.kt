package dev.grana.coletor

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

class MainActivity : Activity() {
    private val listener by lazy { ComponentName(this, NotificationCollector::class.java) }
    private lateinit var endpoint: EditText
    private lateinit var token: EditText
    private lateinit var packages: EditText
    private lateinit var status: TextView
    private lateinit var save: Button
    private var linkNote = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        saveExtras(intent)

        val p = Sender.prefs(this)
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(40, 40, 40, 40) }
        fun field(hint: String, type: Int) = EditText(this).apply {
            this.hint = hint; inputType = type; col.addView(this)
        }
        fun button(label: String, onClick: () -> Unit) =
            Button(this).apply { text = label; setOnClickListener { onClick() }; col.addView(this) }

        status = TextView(this).apply { textSize = 16f; col.addView(this) }
        endpoint = field("Endpoint (https://...)", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI)
        token = field("Token (x-ingest-token)", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD)
        packages = field("Pacotes (um por linha)", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE)
        save = button("Salvar") {
            p.edit().putString("endpoint", endpoint.text.toString().trim())
                .putString("token", token.text.toString().trim())
                .putString("packages", packages.text.toString()).apply()
            load()
        }
        button("Permitir acesso às notificações") { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
        button("Enviar teste") {
            val now = System.currentTimeMillis()
            Sender.send(this, Sender.payload("test", "Teste",
                "Compra de R$ 1,23 APROVADA em TESTE GRANA para o cartão com final 0000.",
                null, null, null, null, now, "test|$now"))
            refreshAfterIo()
        }
        button("Reenviar pendentes") { Sender.flush(this); refreshAfterIo() }

        setContentView(ScrollView(this).apply { fitsSystemWindows = true; addView(col) })
        load()
        prefill(intent)
    }

    // `am start` on an already-visible activity lands here, not in onCreate.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        saveExtras(intent)
        load()
        prefill(intent)
    }

    override fun onResume() {
        super.onResume()
        // Recovery: if Samsung killed us while access is on, opening the app re-binds the listener.
        if (listenerEnabled()) NotificationListenerService.requestRebind(listener)
        refresh()
    }

    /** `adb shell am start -n dev.grana.coletor/.MainActivity --es endpoint URL --es token T [--es packages a,b]` */
    // Activity é exportada (deep link grana://): qualquer app poderia mandar extras e desviar notificações bancárias.
    // Por isso extras só valem enquanto não há token salvo. Reconfigurar: pela tela, ou `adb shell pm clear dev.grana.coletor`.
    private fun saveExtras(i: Intent) {
        val p = Sender.prefs(this)
        if (!p.getString("token", null).isNullOrBlank()) return
        val e = p.edit()
        for (k in listOf("endpoint", "token", "packages")) i.getStringExtra(k)?.let { e.putString(k, it) }
        e.apply()
    }

    /**
     * `grana://setup?endpoint=URL&token=T` (botão no app web). Qualquer página pode disparar esse link,
     * então ele só PREENCHE a tela; gravar exige o toque em "Confirmar configuração" (vale mesmo já havendo token).
     */
    private fun prefill(i: Intent) {
        val u = i.data
        if (i.action != Intent.ACTION_VIEW || u?.scheme != "grana" || u.host != "setup") return
        u.getQueryParameter("endpoint")?.let { endpoint.setText(it.trim()) }
        u.getQueryParameter("token")?.let { token.setText(it.trim()) }
        val host = Uri.parse(endpoint.text.toString()).host ?: "?"
        linkNote = "ATENÇÃO: configuração recebida por link, NADA foi salvo ainda.\n" +
            "Endpoint: $host\nSe não foi você que abriu este link, volte sem salvar.\n\n"
        save.text = "Confirmar configuração"
        refresh()
    }

    /** Fields = what is saved (drops any unconfirmed link prefill). */
    private fun load() {
        linkNote = ""; save.text = "Salvar"
        val p = Sender.prefs(this)
        endpoint.setText(p.getString("endpoint", ""))
        token.setText(p.getString("token", ""))
        packages.setText(p.getString("packages", Sender.DEFAULT_PACKAGES))
        refresh()
    }

    private fun listenerEnabled() =
        (Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: "")
            .split(':').any { ComponentName.unflattenFromString(it) == listener }

    /** Queued after the pending send/flush on the single IO thread, so the count is fresh. */
    private fun refreshAfterIo() = Sender.io.execute { runOnUiThread { refresh() } }

    private fun refresh() {
        status.text = linkNote + "Acesso às notificações: ${if (listenerEnabled()) "ATIVO" else "DESATIVADO"}\n" +
            "Pendentes: ${Sender.pendingCount(this)}\nÚltimo envio: ${Sender.last}"
    }
}
