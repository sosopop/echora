/**
 * Onboarding 视图入口
 *
 * 组装:ProgressBar + Intro + ProfilePills + ChatStream + InputBar
 *
 * 挂载时:
 *   - 若没有 onboarding 状态会话 → createConversation({ learningState: 'onboarding' })
 *   - 选中该会话
 *   - 若该会话无消息 → 自动 sendMessage('hi') 触发 onboarding skill 第一句
 *
 * 注意:严格 mount 一次(useRef 标记防 StrictMode 重复触发)
 */

import { useEffect, useRef } from 'react';
import { chatApi } from '../../api/chat.js';
import { useChatStore } from '../../stores/chat.js';
import { useProfileStore } from '../../stores/profile.js';
import ProgressBar from './ProgressBar.js';
import ProfilePills from './ProfilePills.js';
import ChatStream from './ChatStream.js';
import InputBar from './InputBar.js';
import styles from './index.module.css';

export default function Onboarding(): JSX.Element {
  const profile = useProfileStore((s) => s.profile);
  const error = useChatStore((s) => s.error);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    void (async () => {
      const store = useChatStore.getState();
      await store.loadConversations();
      const fresh = useChatStore.getState();
      let conv = fresh.conversations.find(
        (c) => c.learningState === 'onboarding'
      );
      if (!conv) {
        try {
          conv = await chatApi.createConversation({
            learningState: 'onboarding',
          });
          // 重新加载列表以包含新会话
          await useChatStore.getState().loadConversations();
        } catch (e) {
          console.warn('[Onboarding] 创建会话失败', e);
          return;
        }
      }
      await useChatStore.getState().selectConversation(conv.id);
      const msgs = useChatStore.getState().messages;
      if (msgs.length === 0) {
        await useChatStore.getState().sendMessage('hi');
      }
    })();
  }, []);

  return (
    <div className={styles.shell}>
      <ProgressBar profile={profile} />
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.introTitle}>先认识一下,我是 Echo</h1>
          <p className={styles.introDesc}>
            这几个问题帮我推荐最合适的场景,大约 60 秒
          </p>
        </div>
        <ProfilePills profile={profile} />
        {error && <div className={styles.errorBar}>{error}</div>}
        <ChatStream />
      </main>
      <InputBar />
    </div>
  );
}
