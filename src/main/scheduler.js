let schedulerTimeouts = [];

function clearAllTimeouts() {
    schedulerTimeouts.forEach(timeout => clearTimeout(timeout));
    schedulerTimeouts = [];
}

// Вспомогательная функция для ожидания элемента в DOM
const waitForElementScript = `
  function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        return resolve(element);
      }

      const observer = new MutationObserver(() => {
        const foundElement = document.querySelector(selector);
        if (foundElement) {
          observer.disconnect();
          resolve(foundElement);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(\`Таймаут ожидания элемента \${selector}\`));
      }, timeout);
    });
  }
`;

async function getButtonState(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    console.log('getButtonState: webContents не доступен или уничтожен.');
    return null;
  }
  try {
    const buttonText = await webContents.executeJavaScript(`
      ${waitForElementScript}
      (async function() {
        try {
          const button = await waitForElement('#startEndWorkButton', 5000); // Короткий таймаут для проверки состояния
          console.log('getButtonState (внутри рендерера): Кнопка найдена, текст:', button.innerText);
          return button.innerText;
        } catch (e) {
          console.error('getButtonState (внутри рендерера): Ошибка при поиске кнопки:', e.message);
          return null;
        }
      })();
    `);
    return buttonText;
  } catch (error) {
    console.error('getButtonState (основной процесс): Ошибка при получении состояния кнопки:', error.message);
    return null;
  }
}

async function clickStartEndButton(webContents, store) {
    if (!webContents || webContents.isDestroyed()) { 
        console.log('clickStartEndButton: webContents не доступен или уничтожен. Клик отменен.');
        return;
    }
    console.log('clickStartEndButton (основной процесс): Попытка нажать кнопку startEndWorkButton...');
    try {
        const result = await webContents.executeJavaScript(`
            ${waitForElementScript}
            (async function() {
                try {
                    console.log('clickStartEndButton (внутри рендерера): Поиск кнопки для клика...');
                    const button = await waitForElement('#startEndWorkButton', 10000); // Увеличил таймаут
                    
                    console.log('clickStartEndButton (внутри рендерера): Кнопка найдена, текст:', button.innerText);
                    // Имитация пользовательского клика
                    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                    console.log('clickStartEndButton (внутри рендерера): События клика отправлены.');
                    return 'Кнопка успешно нажата';
                } catch (e) {
                    console.error('clickStartEndButton (внутри рендерера): Ошибка при выполнении скрипта:', e.message, e.stack);
                    return \`Ошибка: \${e.message}\`; // Возвращаем сообщение об ошибке
                }
            })();
        `);
        console.log('clickStartEndButton (результат):', result);

        if (result === 'Кнопка успешно нажата') {
            console.log('clickStartEndButton: Кнопка нажата, ожидание 5 секунд для обновления страницы...');
            setTimeout(() => {
                console.log('clickStartEndButton: Перезапуск планировщика после клика...');
                setupScheduler(webContents, store);
            }, 5000); 
        } else if (result.startsWith('Ошибка:')) {
            console.warn('clickStartEndButton: Клик не выполнен из-за ошибки в рендерере:', result);
        } else {
            console.warn('clickStartEndButton: Клик не выполнен по неизвестной причине.');
        }
    } catch (error) {
        console.error('clickStartEndButton (основной процесс): Ошибка при выполнении скрипта:', error);
    }
}

async function setupScheduler(webContents, store) {
  clearAllTimeouts(); // Всегда очищаем старые таймеры перед новой настройкой
  
  const settings = store.get('settings') || {};
  const autoStartEnabled = settings.autoStartEnabled ?? true;

  if (!autoStartEnabled) {
    console.log('Автоматизация отключена в настройках.');
    return;
  }

  console.log('Настройка точного планировщика...');
  
  const startHour = settings.startHour;
  const startMinute = settings.startMinute;
  const endHour = settings.endHour;
  const endMinute = settings.endMinute;

  const now = new Date();

  // --- Планирование НАЧАЛА рабочего дня ---
  if (startHour !== undefined && startMinute !== undefined) {
    const startTime = new Date(now);
    startTime.setHours(startHour, startMinute, 0, 0);

    if (now < startTime) {
      const startDelay = startTime.getTime() - now.getTime();
      console.log(`Клик "Начать" запланирован в ${startTime.toLocaleTimeString()} (через ${Math.round(startDelay / 1000)} сек)`);
      const startTimeout = setTimeout(async () => {
        console.log(`[Событие] Время начала (${startTime.toLocaleTimeString()}). Проверяем кнопку...`);
        const buttonState = await getButtonState(webContents);
        if (buttonState && buttonState.includes('Начать')) {
            clickStartEndButton(webContents, store);
        } else {
            console.log('[Событие] Кнопка "Начать" не найдена или день уже начат. Клик отменен.');
        }
      }, startDelay);
      schedulerTimeouts.push(startTimeout);
    } else {
      console.log(`Время начала (${startTime.toLocaleTimeString()}) уже прошло. Клик "Начать" не будет запланирован.`);
    }
  } else {
    console.log('Время начала не настроено.');
  }

  // --- Планирование ОКОНЧАНИЯ рабочего дня ---
  if (endHour !== undefined && endMinute !== undefined) {
    const endTime = new Date(now);
    endTime.setHours(endHour, endMinute, 0, 0);

    if (now < endTime) {
      const endDelay = endTime.getTime() - now.getTime();
      console.log(`Клик "Завершить" запланирован в ${endTime.toLocaleTimeString()} (через ${Math.round(endDelay / 1000)} сек)`);
      const endTimeout = setTimeout(async () => {
        console.log(`[Событие] Время окончания (${endTime.toLocaleTimeString()}). Проверяем кнопку...`);
        const buttonState = await getButtonState(webContents);
        if (buttonState && buttonState.includes('Завершить')) {
            clickStartEndButton(webContents, store);
        } else {
            console.log('[Событие] Кнопка "Завершить" не найдена или день еще не начат. Клик отменен.');
        }
      }, endDelay);
      schedulerTimeouts.push(endTimeout);
    } else {
      console.log(`Время окончания (${endTime.toLocaleTimeString()}) уже прошло. Клик "Завершить" не будет запланирован.`);
    }
  } else {
    console.log('Время окончания не настроено.');
  }
}

function clearScheduler() {
    clearAllTimeouts();
}

module.exports = { setupScheduler, clearScheduler, getButtonState };