<?php
if (!defined('ABSPATH')) exit;

if (!class_exists('Tavim_Sheet_Music_Standalone')) {
    class Tavim_Sheet_Music_Standalone {

        public function __construct() {
            add_shortcode('tavim_player', [$this, 'render_shortcode']);
            add_action('wp_enqueue_scripts', [$this, 'enqueue_assets']);
        }

        public function enqueue_assets() {
            global $post;
            if (!is_a($post, 'WP_Post')) {
                return;
            }

            // נבדוק אם צריך לטעון את הנגן בעמוד הנוכחי
            $should_load = false;
            if (is_singular('tavim_score')) {
                $should_load = true;
            } elseif (has_shortcode($post->post_content, 'tavim_player')) {
                $should_load = true;
            } elseif (is_singular('lesson') && get_post_meta($post->ID, '_related_tavim_id', true)) {
                $should_load = true;
            }
            
            if (!$should_load) {
                return;
            }

            // 1. טעינת הספרייה החיצונית
            // אירוח עצמי של abcjs 6.2.0 (ללא CDN — אבטחת supply-chain). ה-synth כלול ב-build ה-basic.
            wp_enqueue_script('abcjs-basic', AMS_PLUGIN_URL . 'assets/vendor/abcjs/abcjs-basic-min.js', [], '6.2.0', true);
            wp_enqueue_style('abcjs-audio', AMS_PLUGIN_URL . 'assets/vendor/abcjs/abcjs-audio.css', [], '6.2.0');

            // 2. הכנת הנתונים מהפוסט הרלוונטי
            $abc_code = '';
            $tempo = 120;
            $auto_play = false;

            $tavim_post_id = 0;
            if (is_singular('tavim_score')) {
                $tavim_post_id = $post->ID;
            } elseif (is_singular('lesson')) {
                $tavim_post_id = get_post_meta($post->ID, '_related_tavim_id', true);
            } elseif (preg_match('/\[tavim_player[^\]]*id="(\d+)"[^\]]*\]/', $post->post_content, $matches)) {
                $tavim_post_id = intval($matches[1]);
            }

            if ($tavim_post_id) {
                $abc_code = get_post_meta($tavim_post_id, '_ams_abc_code', true) ?: get_post_meta($tavim_post_id, '_tavim_pro_plus_abc_code', true);
                $tempo = get_post_meta($tavim_post_id, '_ams_tempo', true) ?: (get_post_meta($tavim_post_id, '_tavim_pro_plus_tempo', true) ?: 120);
                $auto_play = get_post_meta($tavim_post_id, '_ams_auto_play', true) ?: get_post_meta($tavim_post_id, '_tavim_pro_plus_autoplay', true);
            }

            // 3. שליחת ההזמנה הרשמית (הנתונים) ל-JavaScript
            wp_localize_script('abcjs-basic', 'tavimProPlusData', [
                'abc'      => $abc_code,
                'tempo'    => intval($tempo),
                'autoPlay' => $auto_play ? true : false,
            ]);

            // 4. הוספת קוד ההפעלה של הנגן, שירוץ רק אחרי שהספרייה והנתונים מוכנים
            wp_add_inline_script('abcjs-basic', $this->get_inline_js());
        }

        public function render_shortcode($atts) {
            $atts = shortcode_atts(['id' => 0], $atts, 'tavim_player');
            $id = intval($atts['id']);
            if (!$id || 'tavim_score' !== get_post_type($id)) return '';

            // השורטקוד רק מדפיס את ה-HTML. הלוגיקה המורכבת עברה ל-enqueue_assets
            $tempo = get_post_meta($id, '_ams_tempo', true) ?: (get_post_meta($id, '_tavim_pro_plus_tempo', true) ?: 120);
            
            $controls_html = '<div class="tavim-controls">' .
                '<button id="tavim-play" class="button">נגן ▶️</button>' .
                '<button id="tavim-pause" class="button">השהה ⏸️</button>' .
                '<button id="tavim-stop" class="button">עצור ⏹️</button>' .
                '<button id="tavim-tempo" class="button">קצב 🎵</button>' .
                '<span id="metronome-icon" class="metronome-icon"></span>' .
                '<div class="tempo-display">טמפו: <span class="tempo-value">' . intval($tempo) . '</span> BPM' .
                '<div class="tempo-controls hidden">' .
                '<input type="range" id="tempo-slider" class="tempo-slider" min="40" max="240" value="' . intval($tempo) . '">' .
                '<input type="number" id="tempo-input" class="tempo-input" min="40" max="240" value="' . intval($tempo) . '">' .
                '</div></div></div>';
            
            return '<div class="tavim-wrapper"><div class="tavim-notation"></div>' . $controls_html . '</div>';
        }

        private function get_inline_js() {
            return "
            function tavimProPlusWaitForABCJS(callback, maxWait = 5000) {
                const startTime = Date.now();
                (function check() {
                    if (window.ABCJS && window.ABCJS.renderAbc && window.ABCJS.synth) {
                        callback();
                    } else if (Date.now() - startTime < maxWait) {
                        setTimeout(check, 50);
                    }
                })();
            }

            function initTavimProPlus() {
                if (typeof tavimProPlusData === 'undefined' || !tavimProPlusData.abc) return;
                const abc = tavimProPlusData.abc;
                const tempoSetting = parseInt(tavimProPlusData.tempo) || 120;
                let currentTempo = tempoSetting;
                const autoPlay = tavimProPlusData.autoPlay;
                const notationDiv = document.querySelector('.tavim-notation');
                if (!notationDiv) return;
                const controlsDiv = document.querySelector('.tavim-controls');
                const playBtn = document.getElementById('tavim-play');
                const pauseBtn = document.getElementById('tavim-pause');
                const stopBtn = document.getElementById('tavim-stop');
                const tempoBtn = document.getElementById('tavim-tempo');
                const metronomeIcon = document.getElementById('metronome-icon');
                const tempoDisplay = document.querySelector('.tempo-display .tempo-value');
                const tempoControls = document.querySelector('.tempo-controls');
                const tempoSlider = document.getElementById('tempo-slider');
                const tempoInput = document.getElementById('tempo-input');
                let visual = null, synth = null, isPlaying = false, isPaused = false, metronomeInterval = null, userStarted = false;
                try { visual = ABCJS.renderAbc(notationDiv, abc, { responsive: 'resize', add_classes: true })[0]; } catch (e) { return; }
                function updateTempoDisplay() { if(tempoDisplay) tempoDisplay.textContent = currentTempo; }
                updateTempoDisplay();
                function stopMetronome() { if (metronomeInterval) { clearInterval(metronomeInterval); metronomeInterval = null; } if(metronomeIcon) metronomeIcon.classList.remove('metronome-on'); }
                async function initSynth() { if (synth) return; const AudioContext = window.AudioContext || window.webkitAudioContext; const audioContext = new AudioContext(); try { await audioContext.resume(); } catch (e) {} synth = new ABCJS.synth.CreateSynth(); try { await synth.init({ visualObj: visual, audioContext: audioContext, millisecondsPerMeasure: visual.millisecondsPerMeasure(), options: { soundfontUrl: 'https://paulrosen.github.io/midi-js-soundfonts/abcjs/', defaultQpm: currentTempo }}); await synth.prime(); } catch (error) { synth = null; }}
                function stopPlayback() { isPlaying = false; if(playBtn) playBtn.disabled = false; if (stopBtn) stopBtn.disabled = true; try { ABCJS.stopAnimation(); if (synth) { synth.stop(); synth = null; } } catch (e) {} stopMetronome(); userStarted = false; if (pauseBtn) { pauseBtn.textContent = 'השהה ⏸️'; }}
                if(playBtn) playBtn.addEventListener('click', async function() { if (isPlaying) return; isPaused = false; if (pauseBtn) pauseBtn.textContent = 'השהה ⏸️'; userStarted = true; isPlaying = true; playBtn.disabled = true; if (stopBtn) stopBtn.disabled = false; try { await initSynth(); ABCJS.startAnimation(notationDiv, visual, { showCursor: true, bpm: currentTempo, onFinished: () => stopPlayback(), }); if (synth) { try { await synth.start(); } catch (err) {} } (() => { stopMetronome(); if(!metronomeIcon) return; const match = abc.match(/M:\\s*(\\d+)\\/(\\d+)/); let beats = 4; if (match) { beats = parseInt(match[1]); } const measureDuration = (60000 / currentTempo) * beats; metronomeInterval = setInterval(() => { metronomeIcon.classList.add('metronome-on'); setTimeout(() => metronomeIcon.classList.remove('metronome-on'), 150); }, measureDuration); metronomeIcon.classList.add('metronome-on'); setTimeout(() => metronomeIcon.classList.remove('metronome-on'), 150); })(); } catch (err) { stopPlayback(); }});
                if(pauseBtn) pauseBtn.addEventListener('click', function() { if (!isPlaying) return; if (!isPaused) { if (synth && typeof synth.pause === 'function') { try { synth.pause(); } catch (e) {} } stopMetronome(); isPaused = true; pauseBtn.textContent = 'המשך ▶️'; } else { if (synth && typeof synth.resume === 'function') { try { synth.resume(); } catch (e) {} } (() => { stopMetronome(); if(!metronomeIcon) return; const match = abc.match(/M:\\s*(\\d+)\\/(\\d+)/); let beats = 4; if (match) { beats = parseInt(match[1]); } const measureDuration = (60000 / currentTempo) * beats; metronomeInterval = setInterval(() => { metronomeIcon.classList.add('metronome-on'); setTimeout(() => metronomeIcon.classList.remove('metronome-on'), 150); }, measureDuration); metronomeIcon.classList.add('metronome-on'); setTimeout(() => metronomeIcon.classList.remove('metronome-on'), 150); })(); isPaused = false; pauseBtn.textContent = 'השהה ⏸️'; }});
                if(stopBtn) stopBtn.addEventListener('click', function() { stopPlayback(); });
                if(tempoBtn) tempoBtn.addEventListener('click', function() { if(tempoControls) tempoControls.classList.toggle('hidden'); });
                const handleTempoChange = () => { if(isPlaying && userStarted) { stopPlayback(); setTimeout(() => playBtn.click(), 100); } };
                if(tempoSlider) tempoSlider.addEventListener('input', function() { currentTempo = parseInt(this.value); if(tempoInput) tempoInput.value = currentTempo; updateTempoDisplay(); });
                if(tempoSlider) tempoSlider.addEventListener('change', handleTempoChange);
                if(tempoInput) tempoInput.addEventListener('change', function() { let val = parseInt(this.value) || currentTempo; val = Math.max(40, Math.min(240, val)); currentTempo = val; if(tempoSlider) tempoSlider.value = currentTempo; updateTempoDisplay(); handleTempoChange(); });
                if(metronomeIcon) metronomeIcon.addEventListener('click', function() { if (isPlaying) return; if (metronomeInterval) { stopMetronome(); } else { (() => { stopMetronome(); if(!metronomeIcon) return; const match = abc.match(/M:\\s*(\\d+)\\/(\\d+)/); let beats = 4; if (match) { beats = parseInt(match[1]); } const measureDuration = (60000 / currentTempo) * beats; metronomeInterval = setInterval(() => { metronomeIcon.classList.add('metronome-on'); setTimeout(() => metronomeIcon.classList.remove('metronome-on'), 150); }, measureDuration); metronomeIcon.classList.add('metronome-on'); setTimeout(() => metronomeIcon.classList.remove('metronome-on'), 150); })(); }});
                if(playBtn) playBtn.disabled = false;
                if(stopBtn) stopBtn.disabled = true;
                if (autoPlay) { setTimeout(() => { if(playBtn) playBtn.click(); }, 800); }
            }

            document.addEventListener('DOMContentLoaded', function() {
                tavimProPlusWaitForABCJS(initTavimProPlus);
            });
            ";
        }
    }
    new Tavim_Sheet_Music_Standalone();
}