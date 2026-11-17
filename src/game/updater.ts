import { useCallback, useEffect, useState } from 'react';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface AppUpdateInfo {
  hasUpdate: boolean;
  latestVersionName: string;
  latestTag: string;
  downloadUrl: string;
  releaseNotes: string;
}

interface AppUpdatePluginInterface {
  checkForUpdate(): Promise<AppUpdateInfo>;
  startOneTapDownloadAndInstall(options: {
    downloadUrl: string;
    versionName: string;
  }): Promise<{ started: boolean }>;
  addListener(
    eventName: 'updateDownloadStatus',
    listenerFunc: (event: { completed: boolean; success: boolean }) => void,
  ): Promise<PluginListenerHandle>;
}

const AppUpdatePlugin = registerPlugin<AppUpdatePluginInterface>('AppUpdate');

export function useAppUpdater() {
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    let active = true;
    let listenerHandle: PluginListenerHandle | null = null;

    void AppUpdatePlugin.addListener('updateDownloadStatus', (event) => {
      if (active && event.completed) {
        setIsDownloadingUpdate(false);
      }
    }).then((handle) => {
      if (active) {
        listenerHandle = handle;
      } else {
        void handle.remove();
      }
    });

    void AppUpdatePlugin.checkForUpdate()
      .then((info) => {
        if (active && info?.hasUpdate) {
          setAppUpdateInfo(info);
        }
      })
      .catch(() => {
        // Fail silently when offline or GitHub API unreachable
      });

    return () => {
      active = false;
      if (listenerHandle) {
        void listenerHandle.remove();
      }
    };
  }, []);

  const triggerOneTapUpdate = useCallback(() => {
    if (!appUpdateInfo?.hasUpdate || !appUpdateInfo.downloadUrl || isDownloadingUpdate) {
      return;
    }
    setIsDownloadingUpdate(true);
    void AppUpdatePlugin.startOneTapDownloadAndInstall({
      downloadUrl: appUpdateInfo.downloadUrl,
      versionName: appUpdateInfo.latestVersionName,
    }).catch(() => {
      setIsDownloadingUpdate(false);
    });
  }, [appUpdateInfo, isDownloadingUpdate]);

  const dismissUpdateBanner = useCallback(() => {
    setAppUpdateInfo(null);
  }, []);

  return {
    appUpdateInfo,
    isDownloadingUpdate,
    triggerOneTapUpdate,
    dismissUpdateBanner,
  };
}
