package com.flowforge.app

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class HabitsLinkModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "HabitsLink"

    @ReactMethod
    fun notifyComplete(source: String, promise: Promise) {
        val ctx = reactContext.currentActivity ?: reactContext
        val ok = HabitsLink.notifyComplete(ctx, source)
        promise.resolve(ok)
    }

    @ReactMethod
    fun isInstalled(promise: Promise) {
        promise.resolve(HabitsLink.isInstalled(reactContext))
    }
}
