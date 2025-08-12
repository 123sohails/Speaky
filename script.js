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
        
        // Export and share buttons
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
                this.transcription.innerHTML = `
                    <div class="placeholder">
                        <i class="fas fa-comment-dots"></i>
                        <p>Your transcribed text will appear here</p>
                        <small>Click the microphone and start speaking, or click here to edit manually</small>
                    </div>
                `;
            }
        });
    }
    
    async initSpeechRecognition() {
        // Check for speech recognition support with mobile-specific handling
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            const message = this.isMobile ? 
                'Speech recognition not supported on this mobile browser. Try Chrome or Safari.' : 
                'Speech recognition not supported in this browser. Use Chrome, Edge, or Safari.';
            this.showNotification(message, 'error');
            return;
        }

        // Request microphone permission with mobile-specific handling
        try {
            await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            this.showNotification('Microphone access granted!', 'success');
        } catch (error) {
            console.error('Microphone access error:', error);
            const message = this.isMobile ? 
                'Please allow microphone access in your browser settings and refresh the page' : 
                'Please allow microphone access to use speech recognition';
            this.showNotification(message, 'error');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        // Mobile-optimized settings
        this.recognition.continuous = !this.isMobile; // Disable continuous on mobile for better stability
        this.recognition.interimResults = true;
        this.recognition.lang = this.language.value;
        this.recognition.maxAlternatives = 1;
        
        // Mobile-specific settings
        if (this.isMobile) {
            this.recognition.grammars = null; // Disable grammars on mobile
        }
            
        this.recognition.onstart = () => {
            console.log('Speech recognition started');
            this.startTimer();
        };
        
        this.recognition.onresult = (event) => {
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
        };
        
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            let errorMessage = `Error: ${event.error}`;
            
            // Mobile-specific error handling
            if (this.isMobile) {
                switch (event.error) {
                    case 'not-allowed':
                        errorMessage = 'Microphone access denied. Please enable in browser settings.';
                        break;
                    case 'no-speech':
                        errorMessage = 'No speech detected. Try speaking closer to the microphone.';
                        break;
                    case 'network':
                        errorMessage = 'Network error. Check your internet connection.';
                        break;
                    case 'audio-capture':
                        errorMessage = 'Microphone not available. Check if another app is using it.';
                        break;
                }
            }
            
            this.showNotification(errorMessage, 'error');
            this.stopRecording();
        };
        
        this.recognition.onend = () => {
            if (this.isRecording) {
                // Mobile-specific restart logic with delay
                const restartDelay = this.isMobile ? 500 : 100;
                setTimeout(() => {
                    if (this.isRecording) {
                        try {
                            this.recognition.start();
                        } catch (error) {
                            console.error('Failed to restart recognition:', error);
                            this.stopRecording();
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
        
        this.language.addEventListener('change', () => {
            if (this.recognition) this.recognition.lang = this.language.value;
        });
        
        this.voiceCommandsBtn.addEventListener('click', () => this.toggleVoiceCommands());
        this.autoPunctuationBtn.addEventListener('click', () => this.toggleAutoPunctuation());
        
        // Export and share event listeners
        this.exportDocBtn.addEventListener('click', () => this.exportAsDoc());
        this.exportPdfBtn.addEventListener('click', () => this.exportAsPdf());
        this.shareWhatsAppBtn.addEventListener('click', () => this.shareToWhatsApp());
        this.shareTelegramBtn.addEventListener('click', () => this.shareToTelegram());
        this.shareDiscordBtn.addEventListener('click', () => this.shareToDiscord());
        this.shareEmailBtn.addEventListener('click', () => this.shareViaEmail());
        
        // Keyboard shortcuts
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
    }
    
    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }
    
    startRecording() {
        if (!this.recognition) {
            this.showNotification('Speech recognition not available', 'error');
            return;
        }
        
        this.isRecording = true;
        this.micButton.classList.add('recording');
        this.micIcon.className = 'fas fa-stop';
        this.status.textContent = 'Recording... Speak now!';
        this.status.classList.add('recording');
        
        try {
            this.recognition.start();
        } catch (error) {
            this.showNotification('Failed to start recording', 'error');
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
        
        if (this.recognition) this.recognition.stop();
    }
    
    updateTranscript(finalText, interimText) {
        if (finalText) {
            let processedText = this.processVoiceCommands(finalText);
            processedText = this.applyAutoPunctuation(processedText);
            this.transcriptText += processedText;
        }
        
        let displayText = this.transcriptText;
        if (interimText) {
            displayText += `<span class="interim">${interimText}</span>`;
        }
        
        if (displayText.trim()) {
            const placeholder = this.transcription.querySelector('.placeholder');
            if (placeholder) {
                placeholder.remove();
            }
            
            displayText = displayText.replace(/\n/g, '<br>');
            
            // Mobile-specific DOM update with forced reflow
            if (this.isMobile) {
                // Force DOM update on mobile
                this.transcription.style.display = 'none';
                this.transcription.innerHTML = displayText;
                this.transcription.offsetHeight; // Force reflow
                this.transcription.style.display = 'block';
                
                // Ensure contenteditable is properly set
                this.transcription.setAttribute('contenteditable', 'true');
            } else {
                this.transcription.innerHTML = displayText;
            }
        } else if (document.activeElement !== this.transcription) {
            this.transcription.innerHTML = `
                <div class="placeholder">
                    <i class="fas fa-comment-dots"></i>
                    <p>Your transcribed text will appear here</p>
                    <small>Click the microphone and start speaking, or click here to edit manually</small>
                </div>
            `;
        }
        
        this.updateStats();
        
        // Mobile-specific scrolling
        if (this.isMobile) {
            // Use requestAnimationFrame for smoother scrolling on mobile
            requestAnimationFrame(() => {
                this.transcription.scrollTop = this.transcription.scrollHeight;
            });
        } else {
            this.transcription.scrollTop = this.transcription.scrollHeight;
        }
    }
    
    processVoiceCommands(text) {
        if (!this.voiceCommands) return text;
        
        const commands = {
            'new line': '\n',
            'new paragraph': '\n\n',
            'period': '.',
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
                await navigator.clipboard.writeText(text.trim());
                this.showNotification('Text copied to clipboard!', 'success');
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
        this.transcription.innerHTML = `
            <div class="placeholder">
                <i class="fas fa-comment-dots"></i>
                <p>Your transcribed text will appear here</p>
                <small>Click the microphone and start speaking, or click here to edit manually</small>
            </div>
        `;
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
                            setTimeout(() => window.close(), 1000);
                        }
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
        this.timer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            this.timeCount.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }
    
    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Speaky();
});
