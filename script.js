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
        
        // Mobile debugging
        if (this.isMobile) {
            this.debugLog('Mobile device detected');
            this.debugLog(`User Agent: ${navigator.userAgent}`);
            this.debugLog(`Secure Context: ${window.isSecureContext}`);
            this.debugLog(`HTTPS: ${location.protocol === 'https:'}`);
            this.addMobileTestButton();
        }
        
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
        this.debugLog('initSpeechRecognition started');
        
        // Check for speech recognition support with mobile-specific handling
        const hasWebkitSR = 'webkitSpeechRecognition' in window;
        const hasSR = 'SpeechRecognition' in window;
        this.debugLog(`webkitSpeechRecognition: ${hasWebkitSR}, SpeechRecognition: ${hasSR}`);
        
        if (!hasWebkitSR && !hasSR) {
            const message = this.isMobile ? 
                'Speech recognition not supported on this mobile browser. Try Chrome or Safari.' : 
                'Speech recognition not supported in this browser. Use Chrome, Edge, or Safari.';
            this.showNotification(message, 'error');
            this.debugLog('Speech recognition not supported');
            return;
        }

        // Mobile-specific: Check if we're in a secure context
        if (this.isMobile && !window.isSecureContext) {
            this.showNotification('Speech recognition requires HTTPS on mobile devices', 'error');
            this.debugLog('Not in secure context');
            return;
        }

        // Request microphone permission with mobile-specific handling
        this.debugLog('Requesting microphone permission...');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    // Mobile-specific: Use lower sample rate for better compatibility
                    sampleRate: this.isMobile ? 16000 : 44100
                }
            });
            
            // Important: Stop the stream immediately after permission check
            stream.getTracks().forEach(track => track.stop());
            this.debugLog('Microphone permission granted');
            
            this.showNotification('Microphone access granted!', 'success');
        } catch (error) {
            console.error('Microphone access error:', error);
            this.debugLog(`Microphone error: ${error.name} - ${error.message}`);
            const message = this.isMobile ? 
                'Please allow microphone access in your browser settings and refresh the page. Make sure you\'re using HTTPS.' : 
                'Please allow microphone access to use speech recognition';
            this.showNotification(message, 'error');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.debugLog('SpeechRecognition instance created');
        
        // Mobile-optimized settings
        this.recognition.continuous = !this.isMobile; // Disable continuous on mobile for better stability
        this.recognition.interimResults = true;
        this.recognition.lang = this.language.value;
        this.recognition.maxAlternatives = 1;
        
        this.debugLog(`Settings: continuous=${this.recognition.continuous}, interimResults=${this.recognition.interimResults}, lang=${this.recognition.lang}`);
        
        // Mobile-specific settings
        if (this.isMobile) {
            this.recognition.grammars = null; // Disable grammars on mobile
            // Add mobile-specific timeout handling
            this.mobileTimeout = null;
        }
            
        this.recognition.onstart = () => {
            console.log('Speech recognition started');
            this.debugLog('Recognition started');
            this.startTimer();
            
            // Mobile-specific: Set a timeout to prevent hanging
            if (this.isMobile) {
                this.mobileTimeout = setTimeout(() => {
                    if (this.isRecording) {
                        console.log('Mobile timeout reached, restarting recognition');
                        this.debugLog('Mobile timeout reached, restarting');
                        this.recognition.stop();
                    }
                }, 30000); // 30 second timeout
            }
        };
        
        this.recognition.onresult = (event) => {
            this.debugLog(`Recognition result received: ${event.results.length} results`);
            
            // Clear mobile timeout on successful result
            if (this.isMobile && this.mobileTimeout) {
                clearTimeout(this.mobileTimeout);
                this.mobileTimeout = null;
            }
            
            let interimTranscript = '';
            let finalTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                const confidence = event.results[i][0].confidence;
                this.debugLog(`Result ${i}: "${transcript}" (final: ${event.results[i].isFinal}, confidence: ${confidence})`);
                
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }
            
            this.debugLog(`Final: "${finalTranscript}", Interim: "${interimTranscript}"`);
            this.updateTranscript(finalTranscript, interimTranscript);
        };
        
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.debugLog(`Recognition error: ${event.error}`);
            
            // Clear mobile timeout on error
            if (this.isMobile && this.mobileTimeout) {
                clearTimeout(this.mobileTimeout);
                this.mobileTimeout = null;
            }
            
            let errorMessage = `Error: ${event.error}`;
            
            // Mobile-specific error handling
            if (this.isMobile) {
                switch (event.error) {
                    case 'not-allowed':
                        errorMessage = 'Microphone access denied. Please enable in browser settings.';
                        break;
                    case 'no-speech':
                        errorMessage = 'No speech detected. Try speaking closer to the microphone.';
                        this.debugLog('No speech detected, attempting restart');
                        // Don't stop recording for no-speech on mobile, just restart
                        setTimeout(() => {
                            if (this.isRecording) {
                                try {
                                    this.recognition.start();
                                    this.debugLog('Restarted after no-speech');
                                } catch (e) {
                                    console.error('Failed to restart after no-speech:', e);
                                    this.debugLog(`Failed to restart: ${e.message}`);
                                }
                            }
                        }, 1000);
                        return; // Don't call stopRecording for no-speech
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
                        this.debugLog('Recognition aborted (likely intentional)');
                        // Don't show error for aborted on mobile, it's often intentional
                        return;
                }
            }
            
            this.showNotification(errorMessage, 'error');
            this.stopRecording();
        };
        
        this.recognition.onend = () => {
            this.debugLog('Recognition ended');
            
            // Clear mobile timeout
            if (this.isMobile && this.mobileTimeout) {
                clearTimeout(this.mobileTimeout);
                this.mobileTimeout = null;
            }
            
            if (this.isRecording) {
                this.debugLog('Still recording, attempting restart');
                // Mobile-specific restart logic with exponential backoff
                const restartDelay = this.isMobile ? 1000 : 100;
                setTimeout(() => {
                    if (this.isRecording) {
                        try {
                            this.recognition.start();
                            this.debugLog('Recognition restarted successfully');
                        } catch (error) {
                            console.error('Failed to restart recognition:', error);
                            this.debugLog(`Restart failed: ${error.message}`);
                            // On mobile, try one more time after a longer delay
                            if (this.isMobile) {
                                setTimeout(() => {
                                    if (this.isRecording) {
                                        try {
                                            this.recognition.start();
                                            this.debugLog('Second restart attempt successful');
                                        } catch (e) {
                                            console.error('Final restart attempt failed:', e);
                                            this.debugLog(`Final restart failed: ${e.message}`);
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
        
        this.debugLog('Speech recognition initialization complete');
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
        this.debugLog('startRecording called');
        
        if (!this.recognition) {
            this.debugLog('No recognition object available');
            this.showNotification('Speech recognition not available', 'error');
            return;
        }
        
        // Mobile-specific: Ensure we have user interaction
        if (this.isMobile && !document.hasStoredUserActivation) {
            this.debugLog('No user activation stored');
            this.showNotification('Please tap the microphone button to start recording', 'warning');
            return;
        }
        
        this.debugLog('Setting recording state to true');
        this.isRecording = true;
        this.micButton.classList.add('recording');
        this.micIcon.className = 'fas fa-stop';
        this.status.textContent = 'Recording... Speak now!';
        this.status.classList.add('recording');
        
        // Mobile-specific: Add loading state
        if (this.isMobile) {
            this.status.textContent = 'Starting... Please wait';
            setTimeout(() => {
                if (this.isRecording) {
                    this.status.textContent = 'Recording... Speak now!';
                }
            }, 1000);
        }
        
        try {
            // Mobile-specific: Set language again before starting (some mobile browsers reset it)
            if (this.isMobile) {
                this.recognition.lang = this.language.value;
                this.debugLog(`Language set to: ${this.recognition.lang}`);
            }
            
            this.debugLog('Calling recognition.start()');
            this.recognition.start();
            this.debugLog('recognition.start() called successfully');
        } catch (error) {
            console.error('Failed to start recording:', error);
            this.debugLog(`Start recording error: ${error.name} - ${error.message}`);
            let errorMessage = 'Failed to start recording';
            
            if (this.isMobile) {
                if (error.name === 'InvalidStateError') {
                    errorMessage = 'Please wait a moment and try again';
                } else if (error.name === 'NotAllowedError') {
                    errorMessage = 'Microphone access denied. Please check browser settings.';
                }
            }
            
            this.showNotification(errorMessage, 'error');
            this.stopRecording();
        }
    }

    stopRecording() {
        this.debugLog('stopRecording called');
        this.isRecording = false;
        this.micButton.classList.remove('recording');
        this.micIcon.className = 'fas fa-microphone';
        this.status.textContent = 'Click to start recording';
        this.status.classList.remove('recording');
        this.stopTimer();
        
        if (this.recognition) {
            this.debugLog('Calling recognition.stop()');
            this.recognition.stop();
        }
    }

    updateTranscript(finalText, interimText) {
        this.debugLog(`updateTranscript called - Final: "${finalText}", Interim: "${interimText}"`);
        
        if (finalText) {
            let processedText = this.processVoiceCommands(finalText);
            processedText = this.applyAutoPunctuation(processedText);
            this.transcriptText += processedText;
            this.debugLog(`Added to transcript: "${processedText}"`);
            this.debugLog(`Total transcript now: "${this.transcriptText}"`);
        }
        
        let displayText = this.transcriptText;
        if (interimText) {
            displayText += `<span class="interim">${interimText}</span>`;
        }
        
        if (displayText.trim()) {
            this.debugLog('Updating display with text');
            const placeholder = this.transcription.querySelector('.placeholder');
            if (placeholder) {
                placeholder.remove();
                this.debugLog('Removed placeholder');
            }
            
            displayText = displayText.replace(/\n/g, '<br>');
            
            // Mobile-specific DOM update with forced reflow
            if (this.isMobile) {
                this.debugLog('Mobile DOM update with forced reflow');
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
            this.debugLog('Display updated successfully');
        } else if (document.activeElement !== this.transcription) {
            this.debugLog('No text to display, showing placeholder');
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
    
    debugLog(message) {
        if (this.isMobile) {
            console.log(`[SPEAKY DEBUG] ${message}`);
            // Also show in UI for mobile debugging
            const debugDiv = document.getElementById('debug') || this.createDebugDiv();
            debugDiv.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${message}</div>`;
            debugDiv.scrollTop = debugDiv.scrollHeight;
        }
    }
    
    createDebugDiv() {
        const debugDiv = document.createElement('div');
        debugDiv.id = 'debug';
        debugDiv.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: 150px;
            background: rgba(0,0,0,0.9);
            color: #00ff00;
            font-family: monospace;
            font-size: 10px;
            padding: 10px;
            overflow-y: auto;
            z-index: 10000;
            border-top: 1px solid #333;
        `;
        document.body.appendChild(debugDiv);
        return debugDiv;
    }

    addMobileTestButton() {
        const testBtn = document.createElement('button');
        testBtn.textContent = 'Test Speech API';
        testBtn.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 9999;
            background: #ff6b6b;
            color: white;
            border: none;
            padding: 10px;
            border-radius: 5px;
            font-size: 12px;
        `;
        testBtn.onclick = () => this.testSpeechAPI();
        document.body.appendChild(testBtn);
    }

    testSpeechAPI() {
        this.debugLog('=== SPEECH API TEST STARTED ===');
        
        // Test 1: Check API availability
        const hasWebkit = 'webkitSpeechRecognition' in window;
        const hasStandard = 'SpeechRecognition' in window;
        this.debugLog(`API Check - webkit: ${hasWebkit}, standard: ${hasStandard}`);
        
        if (!hasWebkit && !hasStandard) {
            this.debugLog('TEST FAILED: No Speech Recognition API');
            return;
        }
        
        // Test 2: Create recognition instance
        try {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const testRecognition = new SpeechRecognition();
            this.debugLog('TEST PASSED: Recognition instance created');
            
            // Test 3: Configure and test
            testRecognition.continuous = false;
            testRecognition.interimResults = true;
            testRecognition.lang = 'en-US';
            
            testRecognition.onstart = () => {
                this.debugLog('TEST: Recognition started successfully');
            };
            
            testRecognition.onresult = (event) => {
                this.debugLog(`TEST: Got result - ${event.results.length} results`);
                for (let i = 0; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    this.debugLog(`TEST Result ${i}: "${transcript}" (final: ${event.results[i].isFinal})`);
                }
            };
            
            testRecognition.onerror = (event) => {
                this.debugLog(`TEST ERROR: ${event.error}`);
            };
            
            testRecognition.onend = () => {
                this.debugLog('TEST: Recognition ended');
            };
            
            // Test 4: Start recognition
            this.debugLog('TEST: Attempting to start recognition...');
            testRecognition.start();
            
            // Auto-stop after 5 seconds
            setTimeout(() => {
                if (testRecognition) {
                    testRecognition.stop();
                    this.debugLog('TEST: Stopped after 5 seconds');
                }
            }, 5000);
            
        } catch (error) {
            this.debugLog(`TEST FAILED: ${error.name} - ${error.message}`);
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Speaky();
});
