package com.flowforge.app

import android.app.ActivityOptions
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

/**
 * Ticks every Habits habit whose linked app is this source. Must be an
 * explicit start — implicit intents are dropped on Android 11+ / One UI.
 */
object HabitsLink {
    private const val HABITS_PACKAGE = "org.isoron.uhabits"
    private const val HABITS_COMPLETE_CLASS =
        "org.isoron.uhabits.receivers.LinkedCompleteActivity"
    private const val ACTION = "org.isoron.uhabits.ACTION_COMPLETE_LINKED"

    fun isInstalled(context: Context): Boolean {
        return try {
            context.packageManager.getPackageInfo(HABITS_PACKAGE, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }
    }

    fun notifyComplete(context: Context, source: String = "flowforge"): Boolean {
        val appContext = context.applicationContext
        if (!isInstalled(appContext)) return false

        val intent =
            Intent(ACTION).apply {
                setPackage(HABITS_PACKAGE)
                setClassName(HABITS_PACKAGE, HABITS_COMPLETE_CLASS)
                putExtra("source", source)
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS or
                        Intent.FLAG_ACTIVITY_NO_ANIMATION,
                )
            }
        return try {
            if (Build.VERSION.SDK_INT >= 34) {
                val opts = ActivityOptions.makeBasic()
                try {
                    val m =
                        ActivityOptions::class.java.getMethod(
                            "setPendingIntentBackgroundActivityStartMode",
                            Int::class.javaPrimitiveType,
                        )
                    m.invoke(opts, 1)
                } catch (_: Exception) {
                    /* ignore */
                }
                appContext.startActivity(intent, opts.toBundle())
            } else {
                appContext.startActivity(intent)
            }
            true
        } catch (_: Exception) {
            false
        }
    }
}
