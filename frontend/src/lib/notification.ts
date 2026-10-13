/**
 * Audio and Desktop Notification Utility
 */

const notifiedMessages = new Set<string>();

/**
 * Plays a pleasant, two-tone message chime using Web Audio API.
 * Completely self-contained: no external audio files, no CORS issues, no 404s.
 */
export function playNotificationSound() {
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Harmonic Tone 1 (Primary Sine: 880Hz -> 1318.5Hz / A5 -> E6)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1318.5, now + 0.08);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.36);

    // Harmonic Tone 2 (Soft bell shimmer: 1760Hz / A6)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1760, now + 0.06);

    gain2.gain.setValueAtTime(0, now + 0.06);
    gain2.gain.linearRampToValueAtTime(0.08, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.06);
    osc2.stop(now + 0.41);
  } catch {
    // Audio playback blocked or unsupported in current environment
  }
}

/**
 * Requests browser notification permission if not yet decided.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
      return await Notification.requestPermission();
    }
    return Notification.permission;
  }
  return 'denied';
}

/**
 * Triggers a desktop notification if permitted.
 */
export function showDesktopNotification(title: string, body: string, onClick?: () => void) {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const notif = new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'relay-message',
      });
      if (onClick) {
        notif.onclick = () => {
          window.focus();
          onClick();
          notif.close();
        };
      }
    } catch {
      // Notification failed
    }
  }
}

/**
 * Handles incoming message notification logic:
 * - Checks deduplication
 * - Determines if active
 * - Plays sound
 * - Triggers desktop notification
 */
export function handleIncomingMessageNotification({
  messageId,
  senderName,
  senderId,
  currentUserId,
  conversationId,
  activeConversationId,
  onNavigate,
}: {
  messageId: string;
  senderName: string;
  senderId: string;
  currentUserId?: string;
  conversationId: string;
  activeConversationId: string | null;
  onNavigate?: (convId: string) => void;
}) {
  // Don't notify for own messages
  if (currentUserId && senderId === currentUserId) return;

  // Deduplicate
  if (notifiedMessages.has(messageId)) return;
  notifiedMessages.add(messageId);
  if (notifiedMessages.size > 500) {
    const firstKey = notifiedMessages.values().next().value;
    if (firstKey) notifiedMessages.delete(firstKey);
  }

  const isCurrentChat = activeConversationId === conversationId;
  const isTabHidden = typeof document !== 'undefined' && document.hidden;

  // Only notify if user is NOT in this conversation OR the tab is in background
  if (!isCurrentChat || isTabHidden) {
    playNotificationSound();
    showDesktopNotification(senderName, 'New message', () => {
      if (onNavigate) onNavigate(conversationId);
    });

    // Dispatch in-app notification event for banner UI
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('relay-in-app-notification', {
          detail: {
            conversationId,
            senderName,
            message: 'New message',
          },
        })
      );
    }
  }
}
