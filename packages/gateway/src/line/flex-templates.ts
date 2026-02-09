/**
 * LINE Flex Message 模板
 * 用於創建標準化的 Flex Message 結構
 */

import { LineFlexBubble, LineFlexContainer } from '@vsmonster/holography';

/**
 * 創建「查看答案」按鈕 Bubble
 */
export function createCheckResultBubble(
  message: string,
  taskId: string,
  buttonLabel: string = '📬 查看答案'
): LineFlexBubble {
  return {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '🤔 正在思考中...',
          weight: 'bold',
          size: 'md',
          color: '#1DB446',
        },
        {
          type: 'text',
          text: message,
          size: 'sm',
          color: '#666666',
          margin: 'md',
          wrap: true,
        },
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: buttonLabel,
            data: `action=check_result&taskId=${taskId}`,
            displayText: '查看答案',
          },
          style: 'primary',
          color: '#1DB446',
        },
      ],
      paddingAll: '12px',
    },
  };
}

/**
 * 創建進度顯示 Bubble
 */
export function createProgressBubble(
  progress: number,
  taskId: string,
  statusMessage: string = '處理中...'
): LineFlexBubble {
  const progressPercent = Math.min(100, Math.max(0, progress));
  const progressBarWidth = `${progressPercent}%`;

  return {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '⏳ 任務進行中',
          weight: 'bold',
          size: 'md',
          color: '#1DB446',
        },
        {
          type: 'text',
          text: statusMessage,
          size: 'sm',
          color: '#666666',
          margin: 'md',
          wrap: true,
        },
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              contents: [],
              width: progressBarWidth,
              height: '6px',
              backgroundColor: '#1DB446',
              cornerRadius: '3px',
            },
          ],
          backgroundColor: '#E0E0E0',
          cornerRadius: '3px',
          margin: 'lg',
        },
        {
          type: 'text',
          text: `${progressPercent}%`,
          size: 'xs',
          color: '#888888',
          align: 'end',
          margin: 'sm',
        },
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '🔄 查看進度',
            data: `action=check_progress&taskId=${taskId}`,
            displayText: '查看進度',
          },
          style: 'secondary',
        },
      ],
      paddingAll: '12px',
    },
  };
}

/**
 * 創建還在努力中 Bubble
 */
export function createStillProcessingBubble(
  taskId: string,
  message: string = '任務還在處理中，請稍後再試...'
): LineFlexBubble {
  return {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '⏳ 還在努力中...',
          weight: 'bold',
          size: 'md',
          color: '#FF9800',
        },
        {
          type: 'text',
          text: message,
          size: 'sm',
          color: '#666666',
          margin: 'md',
          wrap: true,
        },
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '📬 稍後再查看',
            data: `action=check_result&taskId=${taskId}`,
            displayText: '查看答案',
          },
          style: 'primary',
          color: '#FF9800',
        },
      ],
      paddingAll: '12px',
    },
  };
}

/**
 * 創建成功完成 Bubble
 */
export function createCompletedBubble(
  taskId: string,
  summary?: string
): LineFlexBubble {
  return {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '✅ 任務完成',
          weight: 'bold',
          size: 'md',
          color: '#1DB446',
        },
        ...(summary ? [{
          type: 'text' as const,
          text: summary,
          size: 'sm' as const,
          color: '#666666',
          margin: 'md' as const,
          wrap: true,
        }] : []),
      ],
      paddingAll: '20px',
    },
  };
}

/**
 * 創建錯誤 Bubble
 */
export function createErrorBubble(
  taskId: string,
  errorMessage: string = '處理時發生錯誤'
): LineFlexBubble {
  return {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '❌ 處理失敗',
          weight: 'bold',
          size: 'md',
          color: '#DC3545',
        },
        {
          type: 'text',
          text: errorMessage,
          size: 'sm',
          color: '#666666',
          margin: 'md',
          wrap: true,
        },
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '🔄 重試',
            data: `action=retry&taskId=${taskId}`,
            displayText: '重試',
          },
          style: 'secondary',
        },
      ],
      paddingAll: '12px',
    },
  };
}

/**
 * 解析 Postback data 字符串
 */
export function parsePostbackData(data: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pairs = data.split('&');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value !== undefined) {
      result[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }
  return result;
}
