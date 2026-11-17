package com.lastchance.game

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "AppUpdate")
class AppUpdatePlugin : Plugin() {
    private val pluginScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    @PluginMethod
    fun checkForUpdate(call: PluginCall) {
        pluginScope.launch {
            val info = UpdateManager.checkForUpdate(context)
            val result = JSObject().apply {
                put("hasUpdate", info.hasUpdate)
                put("latestVersionName", info.latestVersionName)
                put("latestTag", info.latestTag)
                put("downloadUrl", info.downloadUrl)
                put("releaseNotes", info.releaseNotes)
            }
            call.resolve(result)
        }
    }

    @PluginMethod
    fun startOneTapDownloadAndInstall(call: PluginCall) {
        val downloadUrl = call.getString("downloadUrl") ?: ""
        val versionName = call.getString("versionName") ?: "latest"
        if (downloadUrl.isBlank()) {
            call.reject("Missing downloadUrl")
            return
        }

        UpdateManager.startOneTapDownloadAndInstall(
            context = context,
            downloadUrl = downloadUrl,
            versionName = versionName
        ) { success ->
            val payload = JSObject().apply {
                put("completed", true)
                put("success", success)
            }
            notifyListeners("updateDownloadStatus", payload)
        }

        call.resolve(JSObject().put("started", true))
    }

    override fun handleOnDestroy() {
        pluginScope.cancel()
        super.handleOnDestroy()
    }
}
