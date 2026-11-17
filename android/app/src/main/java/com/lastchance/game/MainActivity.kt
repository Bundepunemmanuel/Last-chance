package com.lastchance.game;

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(AppUpdatePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
