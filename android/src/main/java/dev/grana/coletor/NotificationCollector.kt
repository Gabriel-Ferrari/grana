package dev.grana.coletor

import android.app.Notification
import android.content.ComponentName
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

class NotificationCollector : NotificationListenerService() {

    override fun onListenerConnected() {
        Log.i(TAG, "listener conectado")
        Sender.flush(this)
    }

    // Samsung unbinds/kills listeners; ask the system to bind us again.
    override fun onListenerDisconnected() {
        Log.w(TAG, "listener desconectado, pedindo rebind")
        requestRebind(ComponentName(this, NotificationCollector::class.java))
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName !in Sender.allowlist(this)) return
        val n = sbn.notification
        if (sbn.isOngoing || n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        val e = n.extras
        fun s(k: String) = e.getCharSequence(k)?.toString()
        val title = s(Notification.EXTRA_TITLE) ?: s(Notification.EXTRA_TITLE_BIG)
        val text = s(Notification.EXTRA_TEXT)
        val bigText = s(Notification.EXTRA_BIG_TEXT)
        if (Sender.seenRecently(this, sbn.packageName, title, text, bigText)) {
            Log.i(TAG, "duplicada, ignorada: ${sbn.key}")
            return
        }
        Log.i(TAG, "capturada: ${sbn.packageName} ${sbn.key}")
        Sender.send(this, Sender.payload(
            sbn.packageName, title, text, bigText,
            s(Notification.EXTRA_SUB_TEXT), s(Notification.EXTRA_INFO_TEXT),
            e.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.joinToString("\n"),
            sbn.postTime, sbn.key,
        ))
    }
}
