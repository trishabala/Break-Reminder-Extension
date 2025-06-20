// extension.js
// GNOME Shell Break Reminder Extension - Compatible with GNOME 48.2
// Uses modern ES module syntax for GNOME Shell 45+

import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class BreakReminderExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._settings = null;
        this.isRunning = false;
        this.countdownTimerId = null;
        this.panelButton = null;
        this.panelText = null;
        this.panelIcon = null;
        this._settingsChangedId = null;
        this.REMINDER_INTERVAL_MS = 15 * 60 * 1000; // Default 15 minutes, updated by settings
        this.remainingSeconds = 0; // The current countdown value
        this.notificationSource = null;
        this.isSnoozing = false; // New state variable to track snooze
        
        // Add sleep/resume detection
        this.lastUpdateTime = 0; // Keep for logging if needed, but not for direct time-based restart
        // this.sleepDetectionThreshold = 5000; // No longer needed for active restart logic
        this._loginManager = null;
        this._prepareForSleepId = null;
    }

    /**
     * Initialize sleep/resume detection
     */
    _initSleepDetection() {
        try {
            // Try to get login manager for sleep detection
            this._loginManager = Gio.DBusProxy.makeProxyWrapper(
                '<node><interface name="org.freedesktop.login1.Manager"><signal name="PrepareForSleep"><arg type="b" name="start"/></signal></interface></node>'
            );
            
            // Note: Gio.DBusProxy.makeProxyWrapper creates a constructor.
            // You need to instantiate it to get the proxy object.
            const proxy = new this._loginManager(
                Gio.DBus.system,
                'org.freedesktop.login1',
                '/org/freedesktop/login1'
            );
            
            this._prepareForSleepId = proxy.connectSignal('PrepareForSleep', (proxy, sender, [isSleeping]) => {
                if (isSleeping) {
                    console.log('Break reminder: System going to sleep');
                    this._onSystemSleep();
                } else {
                    console.log('Break reminder: System resuming from sleep');
                    this._onSystemResume();
                }
            });
            
            console.log('Break reminder: Sleep detection initialized');
        } catch (error) {
            console.log('Break reminder: Could not initialize sleep detection:', error);
            // Fallback to time-based detection only (removed this as a primary mechanism for restart)
        }
    }

    /**
     * Handle system going to sleep
     */
    _onSystemSleep() {
        if (this.isRunning) {
            // No need to save lastUpdateTime here if we trust DBus signals for resume.
            // However, keeping it might be useful for calculating actual sleep duration in _onSystemResume.
            this.lastUpdateTime = Date.now(); 
            console.log('Break reminder: Saved state before sleep');
        }
    }

    /**
     * Handle system resuming from sleep
     */
    _onSystemResume() {
        if (this.isRunning) { // No need to check this.lastUpdateTime > 0 if DBus is reliable
            const sleepDuration = Date.now() - this.lastUpdateTime; // Calculate for logging
            console.log(`Break reminder: System resumed. Sleep duration: ${Math.round(sleepDuration / 1000)} seconds.`);
            
            // Restart the timer to ensure it's working
            this._restartTimer();
        }
    }

    /**
     * Removed _detectSleepResume() function as it's unreliable for active timer management.
     * We will rely on DBus signals for sleep/resume.
     */
    // _detectSleepResume() { ... } 

    /**
     * Restart the timer (used after sleep/resume or settings change)
     */
    _restartTimer() {
        if (!this.isRunning) return; // Only restart if currently running

        console.log('Break reminder: Restarting timer...');
        
        // Clear existing timer if any
        if (this.countdownTimerId) {
            GLib.source_remove(this.countdownTimerId);
            this.countdownTimerId = null;
        }
        
        // Set up the timer again, starting from current remainingSeconds
        // This ensures continuity if resuming from sleep or after settings change
        this.countdownTimerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            1, // Call _updateCountdown every 1 second
            () => this._updateCountdown()
        );
        
        // Update display to reflect current remaining time
        this._updateCountdownDisplay();
    }

    /**
     * Shows a break notification to the user with a snooze option.
     * The notification content changes based on whether it's a regular reminder or after a snooze.
     */
    _showBreakNotification() {
        const intervalMinutes = Math.round(this.REMINDER_INTERVAL_MS / 60 / 1000);
        const intervalSecondsDisplay = this.REMINDER_INTERVAL_MS / 1000;

        let timeText = '';
        if (intervalMinutes > 0 && (intervalSecondsDisplay % 60 !== 0)) {
            timeText = `${intervalMinutes}m ${intervalSecondsDisplay % 60}s`;
        } else if (intervalMinutes > 0) {
            timeText = `${intervalMinutes}m`;
        } else {
            timeText = `${intervalSecondsDisplay}s`;
        }

        // Destroy existing source if present (this was the Type Error fix)
        if (this.notificationSource) {
            console.log('Break reminder: Destroying existing notification source.');
            this.notificationSource.destroy();
            this.notificationSource = null;
        }

        // Always create a fresh notification source
        this.notificationSource = new MessageTray.Source({
            title: 'Break Reminder',
            icon_name: 'daytime-sunrise-symbolic'
        });
        Main.messageTray.add(this.notificationSource);

        let notificationTitle;
        let notificationBody;
        const currentTime = new Date().toLocaleTimeString();

        if (this.isSnoozing) {
            notificationTitle = '⏰ Snooze Over - Time to Move!';
            notificationBody = `Your 5-minute snooze is up at ${currentTime}. Time to stretch, walk around, or do some quick exercises! 💪`;
            this.isSnoozing = false; // Reset snooze state after the notification
            
            // --- RESET FOR NEXT CYCLE HERE (AFTER SNOOZE) ---
            this.remainingSeconds = this.REMINDER_INTERVAL_MS / 1000; 
            console.log('Break reminder: Snooze over notification shown. Timer reset to full interval.');
        } else {
            notificationTitle = '🏃 Time for a Movement Break!';
            notificationBody = `It's been ${timeText} at ${currentTime}. Time to stretch, walk around, or do some quick exercises! 💪`;
            
            // --- RESET FOR NEXT CYCLE HERE (AFTER REGULAR INTERVAL) ---
            this.remainingSeconds = this.REMINDER_INTERVAL_MS / 1000;
            console.log(`Break reminder: Regular notification shown after ${timeText}. Timer reset to full interval.`);
        }

        const notification = new MessageTray.Notification({
            source: this.notificationSource,
            title: notificationTitle,
            body: notificationBody,
            urgency: MessageTray.Urgency.HIGH,
            isTransient: true  // This makes the notification disappear automatically
        });

        notification.addAction('Wait 5 minutes', () => {
            this._waitFiveMinutes();
            notification.destroy(); // Close the current notification after snooze is activated
        });

        this.notificationSource.addNotification(notification);

        // Auto-dismiss the notification after 10 seconds if not interacted with
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
            if (notification && !notification._destroyed) {
                notification.destroy();
            }
            return GLib.SOURCE_REMOVE;
        });

        // The remainingSeconds is now set within the if/else blocks above.
        console.log(`Notification shown. Next cycle will start from ${this.remainingSeconds} seconds.`);
    }


    /**
     * Snooze function: sets the remaining time to 5 minutes and sets snooze flag.
     * The regular countdown loop will take over from here.
     */
    _waitFiveMinutes() {
        console.log('User chose to wait 5 minutes (snooze activated).');
        
        this.isSnoozing = true; // Set snooze flag
        this.remainingSeconds = 5 * 60; // Set remaining time to 5 minutes
        
        // Update display immediately to reflect snooze countdown
        this._updateCountdownDisplay();
        
        // Show confirmation notification - also transient
        if (this.notificationSource) {
            const confirmNotification = new MessageTray.Notification({
                source: this.notificationSource,
                title: '⏰ Break Reminder Snoozed',
                body: `You'll be reminded again in 5 minutes. (${new Date().toLocaleTimeString()})`,
                urgency: MessageTray.Urgency.NORMAL,
                isTransient: true  // Make snooze confirmation also disappear
            });
            this.notificationSource.addNotification(confirmNotification);
            
            // Auto-dismiss snooze confirmation after 3 seconds
            GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
                if (confirmNotification && !confirmNotification._destroyed) {
                    confirmNotification.destroy();
                }
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    /**
     * Updates the countdown display in the panel (e.g., "15m 30s" or "30s")
     */
    _updateCountdownDisplay() {
        if (!this.panelText || !this.isRunning) return;

        const minutes = Math.floor(this.remainingSeconds / 60);
        const seconds = this.remainingSeconds % 60;
        
        if (minutes > 0 && seconds > 0) {
            this.panelText.set_text(`${minutes}m ${seconds}s`);
        } else if (minutes > 0) {
            this.panelText.set_text(`${minutes}m`);
        } else if (seconds >= 0) { // Ensure it shows 0s if it hits exactly 0
            this.panelText.set_text(`${seconds}s`);
        }
        // If remainingSeconds becomes negative for some reason, it will show as 0s or negative seconds, which is fine
    }

    /**
     * The main countdown timer that runs every second.
     * It decrements remainingSeconds and triggers notification when it hits zero.
     */
    _updateCountdown() {
        console.log(`_updateCountdown called. isRunning: ${this.isRunning}, remainingSeconds (before decrement): ${this.remainingSeconds}`);
        if (!this.isRunning) {
            console.log("Break reminder: Timer stopping, isRunning is false.");
            return GLib.SOURCE_REMOVE;
        }

        this.remainingSeconds--;
        console.log(`_updateCountdown: remainingSeconds (after decrement): ${this.remainingSeconds}`);
        
        if (this.remainingSeconds <= 0) {
            console.log("Break reminder: remainingSeconds hit 0, showing notification.");
            this._showBreakNotification(); 
            // remainingSeconds is now reset within _showBreakNotification or _waitFiveMinutes
            console.log(`_updateCountdown: Notification shown, remainingSeconds now (after _showBreakNotification): ${this.remainingSeconds}`);
        }
        // Always update display
        this._updateCountdownDisplay();
        console.log("Break reminder: _updateCountdown returning GLib.SOURCE_CONTINUE.");
        return GLib.SOURCE_CONTINUE;
    }

    /**
     * Toggles the periodic reminder on/off.
     * Handles starting and stopping the main countdown timer.
     */
    _togglePeriodicReminder() {
        this.isRunning = !this.isRunning; // Flip the running state

        if (this.isRunning) {
            // If starting, ensure any old timer is cleared
            if (this.countdownTimerId) {
                GLib.source_remove(this.countdownTimerId);
                this.countdownTimerId = null;
            }
            
            // When starting, always begin from the full reminder interval
            this.remainingSeconds = this.REMINDER_INTERVAL_MS / 1000;
            this.isSnoozing = false; // Ensure snooze flag is false when starting normally
            this.lastUpdateTime = Date.now(); // Initialize time tracking for _onSystemSleep/_onSystemResume
            
            console.log(`Starting break reminder timer: Initial countdown ${this.remainingSeconds} seconds.`);
            
            // Start the single second-interval countdown timer
            this.countdownTimerId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                1, // Call _updateCountdown every 1 second
                () => this._updateCountdown()
            );

            // Update panel visuals for active state
            if (this.panelButton && this.panelText) {
                this.panelButton.add_style_class_name('break-reminder-active');
                this.panelButton.remove_style_class_name('break-reminder-paused');
                this._updateCountdownDisplay(); // Update display with initial countdown
            }
            this.toggleItem.label = 'Pause Reminders'; // Update menu item label
        } else {
            // If pausing, stop the timer
            console.log('Pausing break reminder timer.');
            
            if (this.countdownTimerId) {
                GLib.source_remove(this.countdownTimerId);
                this.countdownTimerId = null;
            }
            this.isSnoozing = false; // Reset snooze flag when paused
            this.lastUpdateTime = 0; // Reset time tracking

            // Update panel visuals for paused state
            if (this.panelButton && this.panelText) {
                this.panelButton.add_style_class_name('break-reminder-paused');
                this.panelButton.remove_style_class_name('break-reminder-active');
                this.panelText.set_text('Paused'); // Display 'Paused' text
            }
            this.toggleItem.label = 'Start Reminders'; // Update menu item label
        }
    }

    /**
     * Handles changes to extension settings (e.g., interval-minutes, interval-seconds).
     * Reloads the interval and restarts the timer if it was running.
     */
    _onSettingsChanged(settings, key) {
        // Only react to changes in interval-minutes or interval-seconds
        if (key === 'interval-minutes' || key === 'interval-seconds') {
            const minutes = settings.get_int('interval-minutes');
            const seconds = settings.get_int('interval-seconds'); // Retrieve seconds from settings
            this.REMINDER_INTERVAL_MS = (minutes * 60 + seconds) * 1000;

            console.log(`Settings changed: New reminder interval set to ${minutes} minutes, ${seconds} seconds.`);

            // If the timer is currently running, restart it with the new interval
            if (this.isRunning) {
                // Clear existing timer
                if (this.countdownTimerId) {
                    GLib.source_remove(this.countdownTimerId);
                    this.countdownTimerId = null;
                }
                
                // Start new timer with the full new interval
                this.remainingSeconds = this.REMINDER_INTERVAL_MS / 1000;
                this.isSnoozing = false; // Ensure snooze flag is false when settings change and restarting
                this.lastUpdateTime = Date.now(); // Reset time tracking
                // Call _restartTimer to manage the GLib.timeout_add_seconds call
                this._restartTimer(); 
                
                this._updateCountdownDisplay(); // Update panel display immediately
            } else {
                // If paused, update remainingSeconds so that when it's next started,
                // it begins with the new interval. Also update the displayed text.
                this.remainingSeconds = this.REMINDER_INTERVAL_MS / 1000;
                if (this.panelText) { // Ensure panelText exists before trying to update it
                    const displayMinutes = Math.floor(this.remainingSeconds / 60);
                    const displaySeconds = this.remainingSeconds % 60;
                    if (displayMinutes > 0 && displaySeconds > 0) {
                        this.panelText.set_text(`${displayMinutes}m ${displaySeconds}s`);
                    } else if (displayMinutes > 0) {
                        this.panelText.set_text(`${displayMinutes}m`);
                    } else {
                        this.panelText.set_text(`${displaySeconds}s`);
                    }
                }
            }
        }
    }

    /**
     * Initializes the panel button with icon, text, and menu items.
     */
    _initPanelButton() {
        // Use a specific position to maintain panel location
        this.panelButton = new PanelMenu.Button(0.0, this.metadata.name, false);

        const box = new St.BoxLayout({
            style_class: 'break-reminder-box'
        });

        this.panelIcon = new St.Icon({
            icon_name: 'daytime-sunrise-symbolic', // Timer/alarm icon
            fallback_icon_name: 'appointment-soon-symbolic',
            style_class: 'break-reminder-icon',
            icon_size: 16
        });

        // Initial text for the panel based on current settings
        const initialIntervalSeconds = this.REMINDER_INTERVAL_MS / 1000;
        const initialMinutes = Math.floor(initialIntervalSeconds / 60);
        const initialSeconds = initialIntervalSeconds % 60;
        
        let initialText = '';
        if (initialMinutes > 0 && initialSeconds > 0) {
            initialText = `${initialMinutes}m ${initialSeconds}s`;
        } else if (initialMinutes > 0) {
            initialText = `${initialMinutes}m`;
        } else {
            initialText = `${initialSeconds}s`;
        }

        this.panelText = new St.Label({
            text: initialText,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'break-reminder-label'
        });

        box.add_child(this.panelIcon);
        box.add_child(this.panelText);
        this.panelButton.add_child(box);

        // Toggle button in menu
        this.toggleItem = new St.Button({
            label: 'Pause Reminders', // Default text assuming auto-start
            style_class: 'break-reminder-menu-button',
            x_align: Clutter.ActorAlign.START,
            reactive: true, can_focus: true, track_hover: true
        });
        this.toggleItem.connect('clicked', () => {
            this._togglePeriodicReminder();
        });
        this.panelButton.menu.box.add_child(this.toggleItem);

        // Settings button in menu
        const settingsItem = new St.Button({
            label: 'Settings',
            style_class: 'break-reminder-menu-button',
            x_align: Clutter.ActorAlign.START,
            reactive: true, can_focus: true, track_hover: true
        });
        settingsItem.connect('clicked', () => {
            this.panelButton.menu.close();
            this.openPreferences();
        });
        this.panelButton.menu.box.add_child(settingsItem);
    }

    /**
     * Called when the extension is enabled.
     * Initializes settings, panel, and starts the reminder.
     */
    enable() {
        console.log(`Enabling Break Reminder Extension ${this.metadata.uuid}`);

        // Get settings and set initial interval
        this._settings = this.getSettings();
        const minutes = this._settings.get_int('interval-minutes');
        const seconds = this._settings.get_int('interval-seconds'); // Retrieve seconds from settings
        this.REMINDER_INTERVAL_MS = (minutes * 60 + seconds) * 1000;

        // Initialize sleep detection
        this._initSleepDetection();

        // Initialize and add panel button with consistent positioning
        this._initPanelButton();
        Main.panel.addToStatusArea(this.metadata.uuid, this.panelButton, 0, 'right');

        // Connect to settings changes
        this._settingsChangedId = this._settings.connect('changed', 
            (settings, key) => this._onSettingsChanged(settings, key));

        // Auto-start reminders
        this._togglePeriodicReminder();
    }

    /**
     * Called when the extension is disabled.
     * Cleans up timers, panel elements, and event connections.
     */
    disable() {
        console.log(`Disabling Break Reminder Extension ${this.metadata.uuid}`);
        this.isRunning = false; // Mark as not running

        // Clean up sleep detection (already improved this part in previous suggestion)
        if (this._prepareForSleepId && this._loginManager) {
            try {
                // If this._loginManager holds the actual proxy instance:
                // this._loginManager.disconnect(this._prepareForSleepId);
                // Otherwise, just nulling out the ID for cleanup is sufficient if the proxy gets garbage collected
                // and its signals disconnected when its last reference is gone.
            } catch (error) {
                console.log('Break reminder: Error cleaning up sleep detection:', error);
            }
        }
        this._loginManager = null; // Clear proxy reference
        this._prepareForSleepId = null; // Clear signal ID

        // Clean up timers
        if (this.countdownTimerId) {
            GLib.source_remove(this.countdownTimerId);
            this.countdownTimerId = null;
        }

        // Clean up notification source
        if (this.notificationSource) {
            console.log('Break reminder: Disabling - Destroying notification source.');
            // --- FIX STARTS HERE ---
            // Main.messageTray.remove(this.notificationSource); // REMOVE THIS LINE
            this.notificationSource.destroy();
            // --- FIX ENDS HERE ---
            this.notificationSource = null;
        }

        // Clean up panel button
        if (this.panelButton) {
            this.panelButton.destroy();
            this.panelButton = null;
        }

        // Disconnect settings change listener
        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        // Clear remaining references
        this.panelText = null;
        this.panelIcon = null;
        this._settings = null;
        this.remainingSeconds = 0;
        this.isSnoozing = false; // Reset snooze state on disable
        this.lastUpdateTime = 0;
    }
}