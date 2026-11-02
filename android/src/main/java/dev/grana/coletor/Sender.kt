package dev.grana.coletor

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

const val TAG = "GranaColetor"

/** Settings, HTTP delivery and the on-disk pending queue. All network/queue I/O runs on [io]. */
object Sender {
    val DEFAULT_PACKAGES = listOf(
        "com.nu.production", "com.bradesco", "br.com.bradesco.cartoes",
        "br.com.sicoobnet", "tivit.com.cabal.sicoob.cp", "br.com.gabba.Caixa",
    ).joinToString("\n")

    /** Single thread: serializes every POST and every touch of the queue file. */
    val io = Executors.newSingleThreadExecutor()

    @Volatile var last = "-"

    fun prefs(c: Context) = c.getSharedPreferences("grana", Context.MODE_PRIVATE)

    fun allowlist(c: Context): Set<String> =
        prefs(c).getString("packages", DEFAULT_PACKAGES)!!
            .split(',', '\n').map { it.trim() }.filter { it.isNotEmpty() }.toSet()

    fun payload(pkg: String, title: String?, text: String?, bigText: String?, subText: String?,
                infoText: String?, textLines: String?, postedAt: Long, key: String): JSONObject =
        JSONObject()
            .put("package", pkg)
            .put("title", title ?: JSONObject.NULL) // put(k, null) would drop the key
            .put("text", text ?: JSONObject.NULL)
            .put("big_text", bigText ?: JSONObject.NULL)
            .put("sub_text", subText ?: JSONObject.NULL)
            .put("info_text", infoText ?: JSONObject.NULL)
            .put("text_lines", textLines ?: JSONObject.NULL)
            .put("posted_at", postedAt)
            .put("key", key)

    fun send(c: Context, json: JSONObject) {
        val app = c.applicationContext
        val body = json.toString()
        io.execute {
            val code = post(app, body)
            when {
                code in 200..299 -> flushNow(app)
                code == 401 || code == 403 -> Log.e(TAG, "HTTP $code: token inválido, descartado")
                retryable(code) -> { queue(app).appendText(body + "\n"); Log.w(TAG, "HTTP $code: enfileirado") }
                else -> Log.e(TAG, "HTTP $code: rejeitado pelo servidor, descartado: $body")
            }
        }
    }

    fun flush(c: Context) { val app = c.applicationContext; io.execute { flushNow(app) } }

    fun pendingCount(c: Context): Int =
        queue(c).takeIf { it.exists() }?.readLines()?.count { it.isNotBlank() } ?: 0

    /** True if this content was already seen in the last 30 min (re-delivery on rebind / re-post). */
    @Synchronized
    fun seenRecently(c: Context, vararg parts: String?): Boolean {
        // ponytail: content-only signature per spec; two identical purchases within 30 min collapse into one.
        val sig = MessageDigest.getInstance("SHA-256")
            .digest(parts.joinToString("\u0000").toByteArray())
            .joinToString("") { "%02x".format(it) }
        val now = System.currentTimeMillis()
        val p = prefs(c)
        val old = JSONObject(p.getString("seen", "{}")!!)
        val kept = old.keys().asSequence().map { it to old.getLong(it) }
            .filter { now - it.second < 30 * 60_000 }.sortedBy { it.second }.toList().takeLast(299)
        val hit = kept.any { it.first == sig }
        val seen = JSONObject().apply { kept.forEach { put(it.first, it.second) } }
        if (!hit) seen.put(sig, now)
        p.edit().putString("seen", seen.toString()).apply()
        return hit
    }

    private fun queue(c: Context) = File(c.filesDir, "pending.jsonl")

    private fun retryable(code: Int) = code == -1 || code == 408 || code == 429 || code >= 500

    /** Oldest first; stops at the first failure so nothing queued is ever lost. Runs on [io] only. */
    private fun flushNow(c: Context) {
        val f = queue(c)
        if (!f.exists()) return
        val lines = f.readLines().filter { it.isNotBlank() }
        var sent = 0
        for (line in lines) {
            val code = post(c, line)
            if (code in 200..299) sent++
            else if (retryable(code) || code == 401 || code == 403) break
            else { Log.e(TAG, "HTTP $code: pendente rejeitado, descartado: $line"); sent++ }
        }
        // ponytail: rewrite once at the end; a crash mid-flush re-sends already-delivered items (server should dedupe on key+posted_at).
        val rest = lines.drop(sent)
        if (rest.isEmpty()) f.delete()
        else File(c.filesDir, "pending.tmp").apply { writeText(rest.joinToString("\n", postfix = "\n")); renameTo(f) }
        Log.i(TAG, "flush: $sent enviados, ${rest.size} pendentes")
    }

    /** Returns the HTTP status, or -1 on network/config error. */
    private fun post(c: Context, body: String): Int {
        val p = prefs(c)
        val code = try {
            val conn = URL(p.getString("endpoint", "")!!).openConnection() as HttpURLConnection
            try {
                conn.connectTimeout = 15_000
                conn.readTimeout = 15_000
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("x-ingest-token", p.getString("token", ""))
                conn.outputStream.use { it.write(body.toByteArray()) }
                conn.responseCode
            } finally { conn.disconnect() }
        } catch (e: Exception) {
            Log.w(TAG, "POST falhou: $e"); -1
        }
        last = if (code == -1) "falha de rede" else "HTTP $code"
        Log.i(TAG, "POST -> $last")
        return code
    }
}
