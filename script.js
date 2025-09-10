class Speaky {
    constructor() {
        this.isRecording = false;
        this.recognition = null;
        this.transcriptText = '';
        this.startTime = null;
        this.timer = null;
        this.autoPunctuation = false;
        this.voiceCommands = false;
        this.isMobile = this.detectMobile();
        this.mobileTimeout = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.restarting = false;
        this.notificationTimeout = null;
        this.recognitionState = 'stopped';
        this.lastFinalTranscript = '';
        this.lastUpdateTime = 0;
        
        this.initElements();
        this.initSpeechRecognition();
        this.initEvents();
    }
    
    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform));
    }

    initElements() {
        this.micButton = document.getElementById('micBtn');
        this.micIcon = document.getElementById('micIcon');
        this.status = document.getElementById('status');
        this.language = document.getElementById('language');
        this.transcription = document.getElementById('transcription');
        this.copyBtn = document.getElementById('copyBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.saveBtn = document.getElementById('saveBtn');
        this.wordCount = document.getElementById('wordCount');
        this.charCount = document.getElementById('charCount');
        this.timeCount = document.getElementById('timeCount');
        this.voiceCommandsBtn = document.getElementById('voiceCommandsBtn');
        this.autoPunctuationBtn = document.getElementById('autoPunctuationBtn');
        
        this.exportDocBtn = document.getElementById('exportDocBtn');
        this.exportPdfBtn = document.getElementById('exportPdfBtn');
        this.shareWhatsAppBtn = document.getElementById('shareWhatsAppBtn');
        this.shareTelegramBtn = document.getElementById('shareTelegramBtn');
        this.shareDiscordBtn = document.getElementById('shareDiscordBtn');
        this.shareEmailBtn = document.getElementById('shareEmailBtn');
        
        this.setupEditableTranscription();
    }
    
    setupEditableTranscription() {
        this.transcription.addEventListener('input', () => {
            this.transcriptText = this.transcription.textContent || '';
            this.updateStats();
        });
        
        this.transcription.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
        });
        
        this.transcription.addEventListener('focus', () => {
            if (this.transcription.textContent.trim() === '') {
                this.transcription.innerHTML = '';
            }
        });
        
        this.transcription.addEventListener('blur', () => {
            if (this.transcription.textContent.trim() === '') {
                this.showPlaceholder();
            }
        });
    }
    
    showPlaceholder() {
        this.transcription.innerHTML = `
            <div class="placeholder">
                <i class="fas fa-comment-dots"></i>
                <p>Your transcribed text will appear here</p>
                <small>Click the microphone and start speaking, or click here to edit manually</small>
            </div>
        `;
    }
    
    async initSpeechRecognition() {
        const isChromeMobile = /Chrome\/[0-9]+\./i.test(navigator.userAgent) && 
                             /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        const hasWebkitSR = 'webkitSpeechRecognition' in window;
        const hasSR = 'SpeechRecognition' in window;
        
        if (!hasWebkitSR && !hasSR) {
            const message = isChromeMobile ? 
                'Please update Chrome to the latest version for best results.' : 
                'Speech recognition not supported in this browser. Use Chrome, Edge, or Safari.';
            this.showNotification(message, 'error');
            return;
        }

        if (this.isMobile && !window.isSecureContext) {
            this.showNotification('Speech recognition requires HTTPS on mobile devices', 'error');
            return;
        }
        
        if (this.isMobile) {
            document.body.addEventListener('touchstart', this.handleTouchStart.bind(this), { once: true });
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: this.isMobile ? 16000 : 44100
                }
            });
            
            stream.getTracks().forEach(track => track.stop());
            
            this.showNotification('Microphone access granted!', 'success');
        } catch (error) {
            console.error('Microphone access error:', error);
            const message = this.isMobile ? 
                'Please allow microphone access in your browser settings and refresh the page. Make sure you\'re using HTTPS.' : 
                'Please allow microphone access to use speech recognition';
            this.showNotification(message, 'error');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        // Mobile-specific settings
        if (this.isMobile) {
            this.recognition.continuous = true; // Changed to true for mobile
            this.recognition.interimResults = false; // Disable interim results on mobile
            this.recognition.maxAlternatives = 1;
            this.mobileTimeout = null;
        } else {
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.maxAlternatives = 1;
        }
        
        this.recognition.lang = this.language.value;
            
        this.recognition.onstart = () => {
            console.log('Speech recognition started');
            this.recognitionState = 'running';
            this.startTimer();
            
            if (this.isMobile) {
                this.mobileTimeout = setTimeout(() => {
                    if (this.isRecording) {
                        console.log('Mobile timeout reached, restarting recognition');
                        this.recognition.stop();
                    }
                }, 30000);
            }
        };
        
        this.recognition.onresult = (event) => {
            // Mobile-specific handling
            if (this.isMobile) {
                const now = Date.now();
                if (now - this.lastUpdateTime < 300) { // 300ms throttle window
                    return;
                }
                this.lastUpdateTime = now;

                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript + ' ';
                    }
                }
                
                if (finalTranscript.trim()) {
                    this.updateTranscript(finalTranscript, '');
                }
            } else {
                // Desktop handling
                let interimTranscript = '';
                let finalTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript + ' ';
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                this.updateTranscript(finalTranscript, interimTranscript);
            }
        };
        
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            
            if (this.isMobile && this.mobileTimeout) {
                clearTimeout(this.mobileTimeout);
                this.mobileTimeout = null;
            }
            
            let errorMessage = `Error: ${event.error}`;
            
            if (this.isMobile) {
                switch (event.error) {
                    case 'not-allowed':
                        errorMessage = 'Microphone access denied. Please enable in browser settings.';
                        break;
                    case 'no-speech':
                        errorMessage = 'No speech detected. Try speaking closer to the microphone.';
                        setTimeout(() => {
                            if (this.isRecording && this.recognitionState !== 'running') {
                                try {
                                    this.recognition.start();
                                    this.recognitionState = 'starting';
                                } catch (e) {
                                    console.error('Failed to restart after no-speech:', e);
                                }
                            }
                        }, 1000);
                        return;
                    case 'network':
                        errorMessage = 'Network error. Check your internet connection and try again.';
                        break;
                    case 'audio-capture':
                        errorMessage = 'Microphone not available. Check if another app is using it.';
                        break;
                    case 'service-not-allowed':
                        errorMessage = 'Speech service not allowed. Try refreshing the page.';
                        break;
                    case 'aborted':
                        return;
                }
            }
            
            this.showNotification(errorMessage, 'error');
            this.stopRecording();
        };
        
        this.recognition.onend = () => {
            this.recognitionState = 'stopped';
            
            if (this.isMobile && this.mobileTimeout) {
                clearTimeout(this.mobileTimeout);
                this.mobileTimeout = null;
            }
            
            if (this.isRecording && !this.restarting) {
                this.restarting = true;
                const restartDelay = this.isMobile ? 1000 : 100;
                setTimeout(() => {
                    this.restarting = false;
                    if (this.isRecording && this.recognitionState === 'stopped') {
                        try {
                            this.recognition.start();
                            this.recognitionState = 'starting';
                        } catch (error) {
                            console.error('Failed to restart recognition:', error);
                            if (this.isMobile) {
                                setTimeout(() => {
                                    if (this.isRecording && this.recognitionState === 'stopped') {
                                        try {
                                            this.recognition.start();
                                            this.recognitionState = 'starting';
                                        } catch (e) {
                                            console.error('Final restart attempt failed:', e);
                                            this.stopRecording();
                                        }
                                    }
                                }, 2000);
                            } else {
                                this.stopRecording();
                            }
                        }
                    }
                }, restartDelay);
            }
        };
    }
    
    initEvents() {
        this.micButton.addEventListener('click', () => this.toggleRecording());
        this.copyBtn.addEventListener('click', () => this.copyText());
        this.clearBtn.addEventListener('click', () => this.clearText());
        this.saveBtn.addEventListener('click', () => this.saveText());
        document.getElementById('correctGrammarBtn').addEventListener('click', () => this.correctGrammar());

        
        this.language.addEventListener('change', () => {
            if (this.recognition) {
                this.recognition.lang = this.language.value;
                if (this.isRecording) {
                    this.recognition.stop();
                }
            }
        });
        
        this.voiceCommandsBtn.addEventListener('click', () => this.toggleVoiceCommands());
        this.autoPunctuationBtn.addEventListener('click', () => this.toggleAutoPunctuation());
        
        this.exportDocBtn.addEventListener('click', () => this.exportAsDoc());
        this.exportPdfBtn.addEventListener('click', () => this.exportAsPdf());
        this.shareWhatsAppBtn.addEventListener('click', () => this.shareToWhatsApp());
        this.shareTelegramBtn.addEventListener('click', () => this.shareToTelegram());
        this.shareDiscordBtn.addEventListener('click', () => this.shareToDiscord());
        this.shareEmailBtn.addEventListener('click', () => this.shareViaEmail());
        
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'S') {
                e.preventDefault();
                this.toggleRecording();
            }
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveText();
            }
            if (e.ctrlKey && e.key === 'c' && !window.getSelection().toString()) {
                e.preventDefault();
                this.copyText();
            }
        });

        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled rejection:', event.reason);
            this.showNotification('An unexpected error occurred', 'error');
        });
    }
    
    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }
    
    handleTouchStart() {
        if (this.isMobile && typeof AudioContext !== 'undefined') {
            this.audioContext = this.audioContext || new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
        }
    }
    
    async startRecording() {
        if (this.isRecording) {
            console.log('Recording already in progress');
            return;
        }
        
        this.isRecording = true;
        this.micButton.classList.add('recording');
        this.micIcon.className = 'fas fa-stop';
        this.status.textContent = 'Initializing...';
        this.status.classList.add('recording');
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
        if (this.isMobile) {
            try {
                this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.mediaStream.getTracks().forEach(track => track.stop());
                
                if (!this.recognition) {
                    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                    if (!SpeechRecognition) {
                        throw new Error('Speech recognition not supported');
                    }
                    
                    this.recognition = new SpeechRecognition();
                    this.recognition.continuous = true; // Changed to true for mobile
                    this.recognition.interimResults = false; // Disabled for mobile
                    this.recognition.lang = this.language.value;
                    this.recognitionState = 'stopped';
                    
                    this.recognition.onresult = (event) => {
                        const now = Date.now();
                        if (now - this.lastUpdateTime < 300) return;
                        this.lastUpdateTime = now;

                        let finalTranscript = '';
                        for (let i = event.resultIndex; i < event.results.length; i++) {
                            if (event.results[i].isFinal) {
                                finalTranscript += event.results[i][0].transcript + ' ';
                            }
                        }
                        
                        if (finalTranscript.trim()) {
                            this.updateTranscript(finalTranscript, '');
                            this.status.textContent = 'Listening...';
                        }
                    };
                    
                    this.recognition.onerror = (event) => {
                        console.error('Speech recognition error:', event.error);
                        let errorMessage = `Error: ${event.error}`;
                        
                        switch (event.error) {
                            case 'not-allowed':
                                errorMessage = 'Microphone access denied. Please enable in browser settings.';
                                break;
                            case 'no-speech':
                                errorMessage = 'No speech detected. Try speaking closer to the microphone.';
                                return;
                            case 'audio-capture':
                                errorMessage = 'No microphone found. Please check your device settings.';
                                break;
                        }
                        
                        this.showNotification(errorMessage, 'error');
                        this.stopRecording();
                    };
                    
                    this.recognition.onstart = () => {
                        this.recognitionState = 'running';
                        console.log('Speech recognition started');
                    };
                    
                    this.recognition.onend = () => {
                        this.recognitionState = 'stopped';
                        if (this.isRecording && !this.restarting) {
                            this.restarting = true;
                            setTimeout(() => {
                                this.restarting = false;
                                if (this.isRecording && this.recognitionState === 'stopped') {
                                    try {
                                        this.recognition.start();
                                        this.recognitionState = 'starting';
                                    } catch (e) {
                                        console.error('Failed to restart recognition:', e);
                                        this.stopRecording();
                                    }
                                }
                            }, 100);
                        }
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));
                this.status.textContent = 'Listening...';
                
                if (this.recognition && this.recognitionState === 'stopped') {
                    this.recognition.start();
                    this.recognitionState = 'starting';
                }
                return;
                
            } catch (error) {
                console.error('Mobile recording error:', error);
                this.showNotification('Failed to access microphone. ' + (error.message || ''), 'error');
                this.stopRecording();
                return;
            }
        }
        
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            this.mediaStream.getTracks().forEach(track => track.stop());
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            this.status.textContent = 'Listening...';
            
            if (this.recognition && this.recognitionState === 'stopped') {
                this.recognition.start();
                this.recognitionState = 'starting';
            }
        } catch (error) {
            console.error('Microphone access error:', error);
            this.showNotification('Microphone access denied. Please allow access to use speech recognition.', 'error');
            this.stopRecording();
        }
    }

    stopRecording() {
        this.isRecording = false;
        this.micButton.classList.remove('recording');
        this.micIcon.className = 'fas fa-microphone';
        this.status.textContent = 'Click to start recording';
        this.status.classList.remove('recording');
        this.stopTimer();
        
        if (this.mobileTimeout) {
            clearTimeout(this.mobileTimeout);
            this.mobileTimeout = null;
        }
        
        if (this.recognition) {
            try {
                this.recognition.stop();
                this.recognitionState = 'stopping';
            } catch (e) {
                console.log('Error stopping recognition:', e);
            }
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
    }

    updateTranscript(finalText, interimText) {
        // Skip empty results
        if ((!finalText || finalText.trim() === '') && (!interimText || interimText.trim() === '')) {
            return;
        }

        try {
            if (finalText) {
                let processedText = this.processVoiceCommands(finalText);
                processedText = this.applyAutoPunctuation(processedText);
                
                // Skip empty processed text
                if (processedText.trim() === '') {
                    return;
                }
                
                // Only append if it's not already at the end of our transcript
                if (!this.transcriptText.endsWith(processedText)) {
                    this.transcriptText += processedText;
                }
            }
            
            let displayText = this.transcriptText;
            if (interimText && !this.isMobile) {  // Only show interim on desktop
                displayText += `<span class="interim">${interimText}</span>`;
            }
            
            if (displayText.trim()) {
                const placeholder = this.transcription.querySelector('.placeholder');
                if (placeholder) {
                    placeholder.remove();
                }
                
                displayText = displayText.replace(/\n/g, '<br>');
                
                // Mobile-specific handling to ensure text appears
                if (this.isMobile) {
                    // First clear the content
                    this.transcription.textContent = '';
                    // Then add new content
                    this.transcription.innerHTML = displayText;
                    // Ensure it's editable
                    this.transcription.setAttribute('contenteditable', 'true');
                } else {
                    this.transcription.innerHTML = displayText;
                }
            } else if (document.activeElement !== this.transcription) {
                this.showPlaceholder();
            }
            
            this.updateStats();
            
            // Auto-scroll to bottom
            requestAnimationFrame(() => {
                this.transcription.scrollTop = this.transcription.scrollHeight;
            });
        } catch (error) {
            console.error('Error in updateTranscript:', error);
        }
    }
    
    processVoiceCommands(text) {
        if (!this.voiceCommands) return text;
        
        const commands = {
            'new line': '\n',
            'new paragraph': '\n\n',
            'period': '.',
            'full stop': '.',
            'comma': ',',
            'question mark': '?',
            'exclamation mark': '!',
            'colon': ':',
            'semicolon': ';',
            'dash': '-',
            'quote': '"',
            'open parenthesis': '(',
            'close parenthesis': ')',
            'delete that': () => {
                const words = this.transcriptText.trim().split(' ');
                words.pop();
                this.transcriptText = words.join(' ') + ' ';
                return '';
            }
        };
        
        let processedText = text;
        for (const [command, replacement] of Object.entries(commands)) {
            const regex = new RegExp(`\\b${command}\\b`, 'gi');
            if (typeof replacement === 'function') {
                if (regex.test(processedText)) {
                    replacement();
                    processedText = processedText.replace(regex, '');
                }
            } else {
                processedText = processedText.replace(regex, replacement);
            }
        }
        
        return processedText;
    }
    
    applyAutoPunctuation(text) {
        if (!this.autoPunctuation) return text;
        
        text = text.replace(/\bi\b/g, 'I');
        text = text.replace(/^(\w)/, (match) => match.toUpperCase());
        text = text.replace(/(\. )(\w)/g, (match, p1, p2) => p1 + p2.toUpperCase());
        
        if (!text.match(/[.!?]$/)) {
            text += '.';
        }
        
        return text;
    }
    
    async copyText() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            try {
                const permission = await navigator.permissions.query({ name: 'clipboard-write' });
                if (permission.state === 'granted' || permission.state === 'prompt') {
                    await navigator.clipboard.writeText(text.trim());
                    this.showNotification('Text copied to clipboard!', 'success');
                } else {
                    this.fallbackCopyText(text.trim());
                }
            } catch (err) {
                this.fallbackCopyText(text.trim());
            }
        } else {
            this.showNotification('No text to copy', 'error');
        }
    }
    
    fallbackCopyText(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            this.showNotification('Text copied to clipboard!', 'success');
        } catch (err) {
            this.showNotification('Failed to copy text', 'error');
        }
        document.body.removeChild(textArea);
    }
    
    getTranscriptText() {
        return this.transcription.textContent || this.transcriptText || '';
    }
    
    clearText() {
        this.transcriptText = '';
        this.lastFinalTranscript = '';
        this.showPlaceholder();
        this.timeCount.textContent = '00:00';
        this.showNotification('Text cleared', 'success');
        this.updateStats();
    }
    
    saveText() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            this.downloadFile(text.trim(), 'text/plain', 'txt');
            this.showNotification('Text saved as TXT file!', 'success');
        } else {
            this.showNotification('No text to save', 'error');
        }
    }
    
    exportAsDoc() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Speaky Transcript</title>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; }
                        h1 { color: #10a37f; margin-bottom: 20px; }
                        .meta { color: #666; font-size: 12px; margin-bottom: 30px; }
                        .content { white-space: pre-wrap; }
                    </style>
                </head>
                <body>
                    <h1>Speaky Transcript</h1>
                    <div class="meta">Generated on ${new Date().toLocaleString()}</div>
                    <div class="content">${text.replace(/\n/g, '<br>')}</div>
                </body>
                </html>
            `;
            this.downloadFile(htmlContent, 'application/msword', 'doc');
            this.showNotification('Exported as DOC file!', 'success');
        } else {
            this.showNotification('No text to export', 'error');
        }
    }
    
    exportAsPdf() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Speaky Transcript</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
                        h1 { color: #333; margin-bottom: 20px; }
                        .meta { color: #666; font-size: 12px; margin-bottom: 30px; }
                        .content { white-space: pre-wrap; margin-top: 20px; }
                        @media print { 
                            body { margin: 0; }
                            @page { margin: 1in; }
                        }
                    </style>
                </head>
                <body>
                    <h1>Speaky Transcript</h1>
                    <div class="meta">Generated on ${new Date().toLocaleString()}</div>
                    <div class="content">${text.replace(/\n/g, '<br>')}</div>
                    <script>
                        window.onload = function() {
                            window.print();
                            setTimeout(() => {
                                if (!document.hasFocus()) {
                                    window.close();
                                }
                            }, 1000);
                        }
                        window.onbeforeunload = () => {
                            if (!document.hasFocus()) {
                                window.close();
                            }
                        };
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
            this.showNotification('Opening PDF print dialog...', 'success');
        } else {
            this.showNotification('No text to export', 'error');
        }
    }
    
    shareToWhatsApp() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            const encodedText = encodeURIComponent(`Speaky Transcript:\n\n${text.trim()}`);
            window.open(`https://wa.me/?text=${encodedText}`, '_blank');
            this.showNotification('Opening WhatsApp...', 'success');
        } else {
            this.showNotification('No text to share', 'error');
        }
    }
    
    shareToTelegram() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            const encodedText = encodeURIComponent(`Speaky Transcript:\n\n${text.trim()}`);
            window.open(`https://t.me/share/url?text=${encodedText}`, '_blank');
            this.showNotification('Opening Telegram...', 'success');
        } else {
            this.showNotification('No text to share', 'error');
        }
    }
    
    shareToDiscord() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            this.copyText();
            this.showNotification('Text copied! Paste it in Discord.', 'success');
        } else {
            this.showNotification('No text to share', 'error');
        }
    }
    
    shareViaEmail() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            const subject = encodeURIComponent('Speaky Transcript');
            const body = encodeURIComponent(`Here's my speech-to-text transcript from Speaky:\n\n${text.trim()}`);
            window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
            this.showNotification('Opening email client...', 'success');
        } else {
            this.showNotification('No text to share', 'error');
        }
    }
    
    toggleVoiceCommands() {
        this.voiceCommands = !this.voiceCommands;
        this.voiceCommandsBtn.style.background = this.voiceCommands ? '#10a37f' : '#2f2f2f';
        this.voiceCommandsBtn.style.color = this.voiceCommands ? 'white' : '#ececf1';
        this.showNotification(
            `Voice commands ${this.voiceCommands ? 'enabled' : 'disabled'}`, 
            this.voiceCommands ? 'success' : 'warning'
        );
    }
    
    toggleAutoPunctuation() {
        this.autoPunctuation = !this.autoPunctuation;
        this.autoPunctuationBtn.style.background = this.autoPunctuation ? '#10a37f' : '#2f2f2f';
        this.autoPunctuationBtn.style.color = this.autoPunctuation ? 'white' : '#ececf1';
        this.showNotification(
            `Auto-punctuation ${this.autoPunctuation ? 'enabled' : 'disabled'}`, 
            this.autoPunctuation ? 'success' : 'warning'
        );
    }
    
    downloadFile(content, mimeType, extension) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `speaky-transcript-${new Date().toISOString().split('T')[0]}.${extension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    updateStats() {
        const text = this.getTranscriptText();
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const chars = text.length;
        
        this.wordCount.textContent = words;
        this.charCount.textContent = chars;
    }
    
    startTimer() {
        this.startTime = Date.now();
        const updateTimer = () => {
            if (this.isRecording) {
                const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                this.timeCount.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                requestAnimationFrame(updateTimer);
            }
        };
        updateTimer();
    }
    
    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    
    showNotification(message, type = 'success') {
        clearTimeout(this.notificationTimeout);
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        this.notificationTimeout = setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Speaky();
});
async correctGrammar() {
    const originalText = this.getTranscriptText();
    const outputDiv = document.getElementById('correctedOutput');

    if (!originalText.trim()) {
        this.showNotification('No text to correct!', 'error');
        return;
    }

    outputDiv.innerHTML = '<p>Correcting...</p>';

    try {
        const response = await fetch('https://api.openai.com/v1/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer YOUR_OPENAI_API_KEY'
 // <-- Replace with your key
            },sk
            body: JSON.stringify({
                model: "text-davinci-003",
                prompt: `Correct the grammar and tenses in this text:\n\n${originalText}`,
                max_tokens: 300
            })
        });

        const data = await response.json();
        const correctedText = data.choices[0].text.trim();
        outputDiv.innerHTML = `<p>${correctedText}</p>`;
        this.showNotification('Grammar corrected!', 'success');
    } catch (error) {
        console.error(error);
        outputDiv.innerHTML = '<p>Error correcting text</p>';
        this.showNotification('Failed to correct grammar', 'error');
    }
}



