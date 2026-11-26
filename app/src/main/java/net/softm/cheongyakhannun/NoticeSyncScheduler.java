package net.softm.cheongyakhannun;

import android.content.Context;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

public final class NoticeSyncScheduler {
    private static final String PERIODIC_WORK = "cheongyakhannun_notice_sync_v1";
    private static final String IMMEDIATE_WORK = "cheongyakhannun_notice_sync_now_v1";

    private NoticeSyncScheduler() { }

    public static void ensureScheduled(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            NoticeSyncWorker.class,
            6,
            TimeUnit.HOURS,
            1,
            TimeUnit.HOURS
        ).setConstraints(constraints).build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        );
    }

    public static void enqueueImmediate(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(NoticeSyncWorker.class)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_WORK,
            ExistingWorkPolicy.REPLACE,
            request
        );
    }
}
