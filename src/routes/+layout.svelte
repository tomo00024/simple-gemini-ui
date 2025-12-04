<script lang="ts">
	import './layout.css'; 
	import { ModeWatcher } from "mode-watcher";
	import { appSettings } from "$lib/settings.svelte";
	import { onMount } from 'svelte';
	import { liveQuery } from 'dexie';
	import { db } from '$lib/db';
	import { backupManager } from '$lib/services/backup.svelte';

	let { children } = $props();

	// 認証コールバックの処理とバックアップ管理の初期化
	onMount(async () => {
		await backupManager.init();
	});

	// セッション更新の監視
	$effect(() => {
		// 最新更新のあったセッションIDを監視
		const sub = liveQuery(() => db.sessions.orderBy('lastUpdatedAt').reverse().limit(1).toArray())
			.subscribe({
				next: (sessions) => {
					if (sessions.length > 0) {
						backupManager.notifyChange(sessions[0].id);
					}
				},
				error: (err) => console.error(err)
			});
		
		return () => sub.unsubscribe();
	});

	$effect(() => {
		// JSON.stringifyを実行することで、オブジェクト内の全プロパティへの
		// アクセスが発生し、深い階層の変更も検知されるようになります。
		JSON.stringify(appSettings.value);
		
		appSettings.save();
	});
</script>

<ModeWatcher />

{@render children()}