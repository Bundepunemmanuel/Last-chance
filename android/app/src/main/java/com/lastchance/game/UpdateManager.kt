package com.lastchance.game

import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

data class AppUpdateInfo(
    val hasUpdate: Boolean,
    val latestVersionName: String = "",
    val latestTag: String = "",
    val downloadUrl: String = "",
    val releaseNotes: String = ""
)

object UpdateManager {
    private const val GITHUB_OWNER = "Bundepunemmanuel"
    private const val GITHUB_REPO = "Last-chance"
    private const val APK_FILENAME = "last-chance"
    private const val TIMEOUT_MS = 8000

    suspend fun checkForUpdate(context: Context): AppUpdateInfo = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        try {
            val apiUrl = "https://api.github.com/repos/$GITHUB_OWNER/$GITHUB_REPO/releases/latest"
            connection = (URL(apiUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("Accept", "application/vnd.github.v3+json")
                setRequestProperty("User-Agent", "$GITHUB_REPO-Android-Updater")
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
            }

            if (connection.responseCode !in 200..299) {
                return@withContext AppUpdateInfo(hasUpdate = false)
            }

            val bodyText = connection.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(bodyText)

            val tagName = json.optString("tag_name", "").trim()
            if (tagName.isEmpty()) {
                return@withContext AppUpdateInfo(hasUpdate = false)
            }

            val latestVersionName = tagName.removePrefix("v").removePrefix("V").trim()
            val releaseNotes = json.optString("body", "").trim()

            val currentVersionName = getCurrentVersionName(context)
            if (!isNewerVersion(latestVersionName, currentVersionName)) {
                return@withContext AppUpdateInfo(
                    hasUpdate = false,
                    latestVersionName = latestVersionName,
                    latestTag = tagName
                )
            }

            val expectedAssetName = "$APK_FILENAME.apk"
            var downloadUrl = ""
            var fallbackApkUrl = ""
            val assets = json.optJSONArray("assets")
            if (assets != null) {
                for (i in 0 until assets.length()) {
                    val asset = assets.optJSONObject(i) ?: continue
                    val name = asset.optString("name", "")
                    val url = asset.optString("browser_download_url", "")
                    if (name.equals(expectedAssetName, ignoreCase = true) && url.isNotEmpty()) {
                        downloadUrl = url
                        break
                    }
                    if (name.endsWith(".apk", ignoreCase = true) && url.isNotEmpty() && fallbackApkUrl.isEmpty()) {
                        fallbackApkUrl = url
                    }
                }
            }

            if (downloadUrl.isEmpty()) {
                downloadUrl = fallbackApkUrl.ifEmpty {
                    "https://github.com/$GITHUB_OWNER/$GITHUB_REPO/releases/download/$tagName/$expectedAssetName"
                }
            }

            AppUpdateInfo(
                hasUpdate = true,
                latestVersionName = latestVersionName,
                latestTag = tagName,
                downloadUrl = downloadUrl,
                releaseNotes = releaseNotes
            )
        } catch (_: Throwable) {
            AppUpdateInfo(hasUpdate = false)
        } finally {
            connection?.disconnect()
        }
    }

    fun startOneTapDownloadAndInstall(
        context: Context,
        downloadUrl: String,
        versionName: String,
        onFinished: ((Boolean) -> Unit)? = null
    ) {
        val appContext = context.applicationContext
        try {
            val downloadsDir = appContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
            if (downloadsDir == null) {
                openInBrowser(appContext, downloadUrl)
                onFinished?.invoke(false)
                return
            }
            if (!downloadsDir.exists()) {
                downloadsDir.mkdirs()
            }

            // Delete older downloaded APK files before saving new one
            downloadsDir.listFiles()?.forEach { file ->
                if (file.isFile && file.name.startsWith("$APK_FILENAME-") && file.name.endsWith(".apk")) {
                    file.delete()
                }
            }

            val safeVersion = versionName.ifBlank { "latest" }.replace(Regex("[^a-zA-Z0-9._-]"), "_")
            val destinationFile = File(downloadsDir, "$APK_FILENAME-$safeVersion.apk")
            if (destinationFile.exists()) {
                destinationFile.delete()
            }

            val downloadManager = appContext.getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager
            if (downloadManager == null) {
                openInBrowser(appContext, downloadUrl)
                onFinished?.invoke(false)
                return
            }

            val request = DownloadManager.Request(Uri.parse(downloadUrl)).apply {
                setTitle("LAST CHANCE v$safeVersion")
                setDescription("Downloading game update...")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setMimeType("application/vnd.android.package-archive")
                setDestinationUri(Uri.fromFile(destinationFile))
                setAllowedOverMetered(true)
                setAllowedOverRoaming(true)
            }

            val downloadId = downloadManager.enqueue(request)

            val receiver = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context?, intent: Intent?) {
                    val completedId = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) ?: -1L
                    if (completedId != downloadId) return

                    try {
                        appContext.unregisterReceiver(this)
                    } catch (_: IllegalArgumentException) {
                    }

                    val success = isDownloadSuccessful(downloadManager, downloadId) && destinationFile.exists()
                    onFinished?.invoke(success)

                    if (success) {
                        triggerApkInstall(appContext, destinationFile)
                    } else {
                        openInBrowser(appContext, downloadUrl)
                    }
                }
            }

            val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                appContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                appContext.registerReceiver(receiver, filter)
            }
        } catch (_: Throwable) {
            openInBrowser(appContext, downloadUrl)
            onFinished?.invoke(false)
        }
    }

    fun triggerApkInstall(context: Context, apkFile: File) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            val settingsIntent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}")
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(settingsIntent)
            return
        }

        val apkUri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.provider",
            apkFile
        )

        val viewIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(apkUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

        try {
            context.startActivity(viewIntent)
        } catch (_: ActivityNotFoundException) {
            @Suppress("DEPRECATION")
            val installIntent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
                data = apkUri
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
            }
            context.startActivity(installIntent)
        }
    }

    private fun isDownloadSuccessful(downloadManager: DownloadManager, downloadId: Long): Boolean {
        val query = DownloadManager.Query().setFilterById(downloadId)
        downloadManager.query(query)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                if (statusIndex >= 0) {
                    return cursor.getInt(statusIndex) == DownloadManager.STATUS_SUCCESSFUL
                }
            }
        }
        return false
    }

    private fun openInBrowser(context: Context, url: String) {
        try {
            val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(browserIntent)
        } catch (_: Throwable) {
        }
    }

    private fun getCurrentVersionName(context: Context): String {
        return try {
            val pkgInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.PackageInfoFlags.of(0)
                )
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(context.packageName, 0)
            }
            pkgInfo.versionName ?: "0.0.0"
        } catch (_: Throwable) {
            "0.0.0"
        }
    }

    private fun isNewerVersion(latest: String, current: String): Boolean {
        val latestParts = parseNumericParts(latest)
        val currentParts = parseNumericParts(current)
        val maxLen = maxOf(latestParts.size, currentParts.size)
        for (i in 0 until maxLen) {
            val l = latestParts.getOrElse(i) { 0 }
            val c = currentParts.getOrElse(i) { 0 }
            if (l > c) return true
            if (l < c) return false
        }
        return false
    }

    private fun parseNumericParts(version: String): List<Int> {
        val cleaned = version.removePrefix("v").removePrefix("V").trim()
        return cleaned.split('.', '-', '_').map { segment ->
            segment.takeWhile { it.isDigit() }.toIntOrNull() ?: 0
        }
    }
}
