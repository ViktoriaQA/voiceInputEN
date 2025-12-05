// Клас TranslationService з автоматичним перемиканням API
class TranslationService {
    constructor() {
        this.services = [
            {
                name: 'MyMemory',
                translator: this.translateMyMemory.bind(this),
                priority: 0,
                enabled: true,
                url: 'https://api.mymemory.translated.net/get'
            },
            {
                name: 'LibreTranslate',
                translator: this.translateLibreTranslate.bind(this),
                priority: 1,
                enabled: true,
                url: 'https://libretranslate.com/translate'
            },
            {
                name: 'Apertium',
                translator: this.translateApertium.bind(this),
                priority: 2,
                enabled: true,
                url: 'https://apertium.org/apy/translate'
            },
            {
                name: 'GoogleTranslate',
                translator: this.translateGoogleAPI.bind(this),
                priority: 3,
                enabled: true,
                url: 'https://translate.googleapis.com'
            }
        ];
        
        this.failedServices = new Set();
        this.logs = [];
        this.maxLogSize = 1000;
    }

    // Логування подій
    log(level, message, service = null, details = null) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: level,
            service: service,
            message: message,
            details: details
        };
        
        this.logs.push(logEntry);
        
        if (this.logs.length > this.maxLogSize) {
            this.logs.shift();
        }
        
        // Оновлення UI
        this.updateLogsUI(logEntry);
    }

    updateLogsUI(logEntry) {
        if (typeof window !== 'undefined' && window.updateTranslationLogs) {
            window.updateTranslationLogs(logEntry);
        }
    }

    // Основний метод перекладу
    async translateText(text, sourceLang, targetLang) {
        if (!text.trim()) {
            this.log('WARN', 'Спроба перекладу пустого тексту');
            return { success: false, text: '' };
        }

        this.log('INFO', `Початок перекладу: "${text.substring(0, 50)}..."`, null, {
            sourceLang: sourceLang,
            targetLang: targetLang,
            textLength: text.length
        });

        const availableServices = this.services
            .filter(service => service.enabled && !this.failedServices.has(service.name))
            .sort((a, b) => a.priority - b.priority);

        this.log('INFO', `Доступні сервіси: ${availableServices.map(s => s.name).join(', ')}`, null, {
            total: availableServices.length,
            failed: Array.from(this.failedServices)
        });

        if (availableServices.length === 0) {
            this.log('ERROR', 'Немає доступних сервісів перекладу');
            return this.useBackupTranslation(text);
        }

        for (const service of availableServices) {
            try {
                this.log('INFO', `Спроба перекладу через ${service.name}`, service.name);
                
                const startTime = Date.now();
                const result = await service.translator(text, sourceLang, targetLang);
                const duration = Date.now() - startTime;
                
                if (result.success) {
                    this.log('SUCCESS', `Переклад успішний через ${service.name}`, service.name, {
                        duration: `${duration}ms`,
                        textLength: result.text.length
                    });
                    
                    // Якщо успішно, скидаємо помилковий статус для цього сервісу
                    this.failedServices.delete(service.name);
                    return result;
                }
                
            } catch (error) {
                this.log('ERROR', `Помилка перекладу через ${service.name}`, service.name, {
                    error: error.message
                });
                
                // Якщо це помилка 429 (ліміт), додаємо сервіс до невдалих
                if (error.message.includes('429') || error.message.includes('limit')) {
                    this.failedServices.add(service.name);
                    this.log('WARN', `Ліміт сервісу ${service.name} перевищено`, service.name);
                }
                
                continue;
            }
        }
        
        this.log('ERROR', 'Усі сервіси перекладу не спрацювали', null, {
            failedServices: Array.from(this.failedServices)
        });
        
        // Використовуємо резервний переклад
        return this.useBackupTranslation(text);
    }

    // MyMemory API
    async translateMyMemory(text, sourceLang, targetLang) {
        try {
            const response = await fetch(
                `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`
            );
            
            if (response.status === 429) {
                throw new Error('429 - Rate limit exceeded');
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.responseStatus === 200) {
                return {
                    success: true,
                    text: data.responseData.translatedText,
                    service: 'MyMemory'
                };
            } else {
                throw new Error(`API error: ${data.responseStatus}`);
            }
            
        } catch (error) {
            throw new Error(`MyMemory failed: ${error.message}`);
        }
    }

    // LibreTranslate API
    async translateLibreTranslate(text, sourceLang, targetLang) {
        try {
            // LibreTranslate використовує скорочення мов
            const langMap = { 'en': 'en', 'uk': 'uk' };
            const source = langMap[sourceLang] || sourceLang;
            const target = langMap[targetLang] || targetLang;
            
            const response = await fetch('https://libretranslate.com/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    q: text,
                    source: source,
                    target: target,
                    format: 'text'
                })
            });
            
            if (response.status === 429) {
                throw new Error('429 - Rate limit exceeded');
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.translatedText) {
                return {
                    success: true,
                    text: data.translatedText,
                    service: 'LibreTranslate'
                };
            } else {
                throw new Error('No translation received');
            }
            
        } catch (error) {
            throw new Error(`LibreTranslate failed: ${error.message}`);
        }
    }

    // Apertium API
    async translateApertium(text, sourceLang, targetLang) {
        try {
            const langPair = `${sourceLang}|${targetLang}`;
            const response = await fetch(
                `https://apertium.org/apy/translate?q=${encodeURIComponent(text)}&langpair=${langPair}`
            );
            
            if (response.status === 429) {
                throw new Error('429 - Rate limit exceeded');
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.responseData && data.responseData.translatedText) {
                return {
                    success: true,
                    text: data.responseData.translatedText,
                    service: 'Apertium'
                };
            } else {
                throw new Error('No translation received');
            }
            
        } catch (error) {
            throw new Error(`Apertium failed: ${error.message}`);
        }
    }

    // Google Translate API (неофіційний метод)
    async translateGoogleAPI(text, sourceLang, targetLang) {
        try {
            const response = await fetch(
                `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
            );
            
            if (response.status === 429) {
                throw new Error('429 - Rate limit exceeded');
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data && data[0] && data[0][0] && data[0][0][0]) {
                return {
                    success: true,
                    text: data[0][0][0],
                    service: 'GoogleTranslate'
                };
            } else {
                throw new Error('No translation received');
            }
            
        } catch (error) {
            throw new Error(`GoogleTranslate failed: ${error.message}`);
        }
    }

    // Резервний переклад
    useBackupTranslation(text) {
        this.log('WARN', 'Використання резервного перекладу', 'Backup');
        
        const backupDict = {
            'hello': 'привіт', 'world': 'світ', 'how': 'як', 'are': 'є', 'you': 'ти',
            'what': 'що', 'where': 'де', 'when': 'коли', 'why': 'чому', 'who': 'хто',
            'which': 'який', 'good': 'добре', 'morning': 'ранок', 'afternoon': 'день',
            'evening': 'вечір', 'night': 'ніч', 'thank': 'дякую', 'please': 'будь ласка',
            'yes': 'так', 'no': 'ні', 'sorry': 'вибачте', 'help': 'допомога',
            'name': 'ім\'я', 'my': 'мій', 'is': 'є', 'your': 'твій', 'his': 'його',
            'her': 'її', 'our': 'наш', 'their': 'їхній', 'and': 'і', 'but': 'але',
            'or': 'або', 'because': 'тому що', 'if': 'якщо', 'then': 'тоді',
            'very': 'дуже', 'too': 'теж', 'also': 'також', 'only': 'тільки'
        };
        
        let translated = text;
        Object.keys(backupDict).forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            translated = translated.replace(regex, backupDict[word]);
        });
        
        return {
            success: true,
            text: '[Резервний переклад] ' + translated,
            service: 'BackupDictionary'
        };
    }

    // Додаткові методи
    resetFailedServices() {
        this.failedServices.clear();
        this.log('INFO', 'Скинуто список невдалих сервісів');
    }

    getServiceStatus() {
        return this.services.map(service => ({
            name: service.name,
            enabled: service.enabled,
            failed: this.failedServices.has(service.name),
            priority: service.priority
        }));
    }
}

// Елементи DOM
const elements = {
    englishText: document.getElementById('englishText'),
    ukrainianText: document.getElementById('ukrainianText'),
    micButton: document.getElementById('micButton'),
    copyEnglish: document.getElementById('copyEnglish'),
    copyUkrainian: document.getElementById('copyUkrainian'),
    clearText: document.getElementById('clearText'),
    recordingIndicator: document.getElementById('recordingIndicator'),
    questionIndicator: document.getElementById('questionIndicator'),
    answersContainer: document.getElementById('answersContainer'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    saveApiKey: document.getElementById('saveApiKey'),
    notification: document.getElementById('notification'),
    translationStatus: document.getElementById('translationStatus'),
    togglePassword: document.getElementById('togglePassword'),
    voiceLogContainer: document.getElementById('voiceLogContainer'),
    clearVoiceLog: document.getElementById('clearVoiceLog'),
    translationLogContainer: document.getElementById('translationLogContainer'),
    clearTranslationLog: document.getElementById('clearTranslationLog')
};

// Змінні стану
let recognition = null;
let isRecording = false;
let deepSeekApiKey = localStorage.getItem('deepSeekApiKey') || '';
let sourceLanguage = 'en';
let targetLanguage = 'uk';
// Load voice log and ensure entries have a translation field for backward compatibility
let voiceLog = JSON.parse(localStorage.getItem('voiceLog')) || [];
voiceLog = voiceLog.map(entry => {
    // If old entries were stored as plain strings or missing translation, normalize
    if (typeof entry === 'string') {
        return { text: entry, translation: '', timestamp: new Date().toLocaleTimeString() };
    }
    return Object.assign({ translation: '' }, entry);
});

// Ініціалізація TranslationService
const translationService = new TranslationService();

// Глобальна функція для оновлення UI логів
window.updateTranslationLogs = function(logEntry) {
    if (!elements.translationLogContainer) return;
    
    const logElement = document.createElement('div');
    logElement.className = 'log-entry';
    
    const levelClass = `log-level log-level-${logEntry.level.toLowerCase()}`;
    const time = new Date(logEntry.timestamp).toLocaleTimeString();
    
    logElement.innerHTML = `
        <span class="log-time">[${time}]</span>
        <span class="${levelClass}">${logEntry.level}</span>
        <span class="log-service">${logEntry.service || 'SYSTEM'}</span>
        <span class="log-message">${logEntry.message}</span>
    `;
    
    // Видаляємо повідомлення про порожній журнал
    if (elements.translationLogContainer.children.length === 1 && 
        elements.translationLogContainer.children[0].textContent.includes('порожній')) {
        elements.translationLogContainer.innerHTML = '';
    }
    
    elements.translationLogContainer.appendChild(logElement);
    elements.translationLogContainer.scrollTop = elements.translationLogContainer.scrollHeight;
};

// Безпечне додавання обробників подій
function safeAddEventListener(element, event, handler) {
    if (element && typeof handler === 'function') {
        element.addEventListener(event, handler);
    }
}

// Ініціалізація
function init() {
    console.log('Ініціалізація додатку...');
    
    // Перевірка підтримки Web Speech API
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('Ваш браузер не підтримує розпізнавання мовлення. Спробуйте використати Chrome або Edge.');
        if (elements.micButton) elements.micButton.disabled = true;
        return;
    }
    
    // Ініціалізація розпізнавання мовлення
    try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        
        // Обробники подій розпізнавання
        recognition.onstart = function() {
            isRecording = true;
            if (elements.micButton) {
                elements.micButton.innerHTML = '<i class="material-icons">stop</i> Зупинити запис';
                elements.micButton.classList.add('recording');
            }
            if (elements.recordingIndicator) elements.recordingIndicator.classList.add('active');
        };
        
        recognition.onend = function() {
            isRecording = false;
            if (elements.micButton) {
                elements.micButton.innerHTML = '<i class="material-icons">mic</i> Голосовий ввід';
                elements.micButton.classList.remove('recording');
            }
            if (elements.recordingIndicator) elements.recordingIndicator.classList.remove('active');
        };
        
        recognition.onresult = function(event) {
            let interimTranscript = '';
            let finalTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }
            
            // Оновлення текстового поля
            if (elements.englishText) {
                elements.englishText.value = finalTranscript + interimTranscript;
            }
            
            // Автоматичний переклад
            if (finalTranscript) {
                translateText(finalTranscript);
                
                // Перевірка на наявність запитання
                checkForQuestion(finalTranscript);
                
                // Додавання до журналу
                if (finalTranscript.trim()) {
                    addToLog(finalTranscript);
                }
            }
        };
        
        recognition.onerror = function(event) {
            console.error('Помилка розпізнавання мовлення:', event.error);
            showNotification('Помилка розпізнавання мовлення: ' + event.error, 'error');
        };
    } catch (error) {
        console.error('Помилка ініціалізації розпізнавання мовлення:', error);
        if (elements.micButton) elements.micButton.disabled = true;
    }
    
    // Безпечне додавання обробників подій
    safeAddEventListener(elements.micButton, 'click', toggleRecording);
    safeAddEventListener(elements.copyEnglish, 'click', () => copyToClipboard(elements.englishText));
    safeAddEventListener(elements.copyUkrainian, 'click', () => copyToClipboard(elements.ukrainianText));
    safeAddEventListener(elements.clearText, 'click', clearAllText);
    safeAddEventListener(elements.togglePassword, 'click', togglePasswordVisibility);
    safeAddEventListener(elements.clearVoiceLog, 'click', clearVoiceLogHandler);
    safeAddEventListener(elements.clearTranslationLog, 'click', clearTranslationLogHandler);
    safeAddEventListener(elements.saveApiKey, 'click', saveApiKeyHandler);
    
    // Обробники подій введення тексту
    safeAddEventListener(elements.englishText, 'input', handleTextInput);
    
    // Завантаження збереженого API ключа
    if (elements.apiKeyInput) {
        elements.apiKeyInput.value = deepSeekApiKey;
    }
    
    // Завантаження журналу
    updateLogDisplay();
    
    console.log('Додаток успішно ініціалізовано');
}

// Функції
function toggleRecording() {
    if (!recognition) return;
    
    if (isRecording) {
        recognition.stop();
    } else {
        try {
            recognition.start();
        } catch (error) {
            console.error('Помилка запуску запису:', error);
            showNotification('Помилка запуску запису', 'error');
        }
    }
}

function handleTextInput() {
    if (!elements.englishText) return;
    
    // Автоматичний переклад при зміні тексту
    if (elements.englishText.value.trim()) {
        translateText(elements.englishText.value);
        checkForQuestion(elements.englishText.value);
    } else {
        if (elements.ukrainianText) elements.ukrainianText.value = '';
        if (elements.translationStatus) {
            elements.translationStatus.textContent = '';
            elements.translationStatus.className = 'status-indicator';
        }
    }
}

async function translateText(text) {
    if (!text.trim() || !elements.ukrainianText || !elements.translationStatus) return;
    
    // Оновлення статусу перекладу
    elements.translationStatus.textContent = 'Переклад...';
    elements.translationStatus.className = 'status-indicator status-translating';
    
    try {
        const result = await translationService.translateText(text, sourceLanguage, targetLanguage);
        
        elements.ukrainianText.value = result.text;
        elements.translationStatus.textContent = `Переклад завершено (${result.service})!`;
        elements.translationStatus.className = 'status-indicator status-success';
        
    } catch (error) {
        console.error('Помилка перекладу:', error);
        elements.translationStatus.textContent = 'Помилка перекладу';
        elements.translationStatus.className = 'status-indicator status-error';
    }
}

function checkForQuestion(text) {
    if (!elements.questionIndicator || !elements.answersContainer) return;
    
    // Проста перевірка на наявність запитання
    const hasQuestionMark = text.includes('?');
    const questionWords = ['what', 'when', 'where', 'why', 'how', 'who', 'which', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does', 'did'];
    const hasQuestionWord = questionWords.some(word => 
        text.toLowerCase().includes(word) && 
        (text.toLowerCase().indexOf(word) === 0 || 
            text[text.toLowerCase().indexOf(word) - 1] === ' ')
    );
    
    if (hasQuestionMark || hasQuestionWord) {
        elements.questionIndicator.style.display = 'block';
        getAnswerFromDeepSeek(text);
    } else {
        elements.questionIndicator.style.display = 'none';
        elements.answersContainer.innerHTML = '<p>Тут будуть відображатись відповіді на ваші запитання. Для роботи необхідно ввести API ключ DeepSeek.</p>';
    }
}

async function getAnswerFromDeepSeek(question) {
    if (!elements.answersContainer) return;
    
    if (!deepSeekApiKey) {
        elements.answersContainer.innerHTML = '<div class="answer"><p>Для отримання відповідей введіть API ключ DeepSeek у верхньому полі.</p></div>';
        return;
    }
    
    elements.answersContainer.innerHTML = '<div class="answer"><p>Шукаємо відповідь... <span class="loading"></span></p></div>';
    
    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${deepSeekApiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'user', content: question }
                ],
                max_tokens: 500
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            const answer = data.choices[0].message.content;
            elements.answersContainer.innerHTML = `<div class="answer"><p>${answer}</p></div>`;
        } else {
            elements.answersContainer.innerHTML = '<div class="answer"><p>Помилка отримання відповіді. Перевірте API ключ.</p></div>';
        }
    } catch (error) {
        console.error('Помилка отримання відповіді:', error);
        elements.answersContainer.innerHTML = '<div class="answer"><p>Помилка з\'єднання з сервісом відповідей.</p></div>';
    }
}

function copyToClipboard(textarea) {
    if (!textarea) return;
    
    textarea.select();
    document.execCommand('copy');
    showNotification('Текст скопійовано в буфер обміну!');
}

function clearAllText() {
    if (elements.englishText) elements.englishText.value = '';
    if (elements.ukrainianText) elements.ukrainianText.value = '';
    if (elements.translationStatus) {
        elements.translationStatus.textContent = '';
        elements.translationStatus.className = 'status-indicator';
    }
    if (elements.questionIndicator) elements.questionIndicator.style.display = 'none';
    if (elements.answersContainer) elements.answersContainer.innerHTML = '<p>Тут будуть відображатись відповіді на ваші запитання. Для роботи необхідно ввести API ключ DeepSeek.</p>';
}

function saveApiKeyHandler() {
    if (!elements.apiKeyInput) return;
    
    deepSeekApiKey = elements.apiKeyInput.value.trim();
    localStorage.setItem('deepSeekApiKey', deepSeekApiKey);
    showNotification('API ключ збережено!');
}

function togglePasswordVisibility() {
    if (!elements.apiKeyInput || !elements.togglePassword) return;
    
    const icon = elements.togglePassword.querySelector('.material-icons');
    if (!icon) return;
    
    if (elements.apiKeyInput.type === 'password') {
        elements.apiKeyInput.type = 'text';
        icon.textContent = 'visibility_off';
    } else {
        elements.apiKeyInput.type = 'password';
        icon.textContent = 'visibility';
    }
}

// Add entry to voice log and fetch Ukrainian translation asynchronously
async function addToLog(text) {
    const timestamp = new Date().toLocaleTimeString();

    // Insert a placeholder entry with empty translation so UI updates immediately
    const entry = { text, translation: '', timestamp };
    voiceLog.unshift(entry);

    if (voiceLog.length > 50) {
        voiceLog = voiceLog.slice(0, 50);
    }

    localStorage.setItem('voiceLog', JSON.stringify(voiceLog));
    updateLogDisplay();

    // Perform translation and update the entry when available
    try {
        const result = await translationService.translateText(text, sourceLanguage, targetLanguage);
        entry.translation = result.success ? result.text : '[Переклад не доступний]';
    } catch (err) {
        console.error('Помилка при отриманні перекладу для журналу:', err);
        entry.translation = '[Помилка перекладу]';
    }

    // Persist and refresh UI
    localStorage.setItem('voiceLog', JSON.stringify(voiceLog));
    updateLogDisplay();
}

function updateLogDisplay() {
    if (!elements.voiceLogContainer) return;
    elements.voiceLogContainer.innerHTML = '';

    if (voiceLog.length === 0) {
        elements.voiceLogContainer.innerHTML = '<div class="log-entry">Журнал порожній. Почніть розмову...</div>';
        return;
    }

    // Optional header row for columns
    const headerRow = document.createElement('div');
    headerRow.className = 'log-entry log-row log-header';
    headerRow.innerHTML = `
        <div class="log-col log-col-original"><strong>Оригінал (EN)</strong></div>
        <div class="log-col log-col-translation"><strong>Переклад (UA)</strong></div>
    `;
    elements.voiceLogContainer.appendChild(headerRow);

    voiceLog.forEach(entry => {
        const row = document.createElement('div');
        row.className = 'log-entry log-row';

        const originalCol = document.createElement('div');
        originalCol.className = 'log-col log-col-original';
        originalCol.innerHTML = `<span class="log-time">${entry.timestamp}</span> ${escapeHtml(entry.text)}`;

        const translationCol = document.createElement('div');
        translationCol.className = 'log-col log-col-translation';
        translationCol.textContent = entry.translation || 'Переклад...';

        row.appendChild(originalCol);
        row.appendChild(translationCol);

        elements.voiceLogContainer.appendChild(row);
    });
}

// Simple HTML escape to avoid injection in logs
function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function clearVoiceLogHandler() {
    voiceLog = [];
    localStorage.setItem('voiceLog', JSON.stringify(voiceLog));
    updateLogDisplay();
    showNotification('Журнал голосу очищено!');
}

function clearTranslationLogHandler() {
    if (!elements.translationLogContainer) return;
    
    elements.translationLogContainer.innerHTML = '<div class="log-entry">Журнал перекладу порожній. Почніть використовувати переклад...</div>';
    translationService.logs = [];
    showNotification('Журнал перекладу очищено!');
}

function showNotification(message, type = 'success') {
    if (!elements.notification) return;
    
    elements.notification.textContent = message;
    elements.notification.className = 'notification';
    if (type === 'error') {
        elements.notification.style.backgroundColor = 'var(--accent-color)';
    } else {
        elements.notification.style.backgroundColor = 'var(--success-color)';
    }
    
    elements.notification.classList.add('show');
    
    setTimeout(() => {
        if (elements.notification) {
            elements.notification.classList.remove('show');
        }
    }, 3000);
}

// Ініціалізація додатку
document.addEventListener('DOMContentLoaded', init);