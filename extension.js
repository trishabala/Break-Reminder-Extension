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
    }

    /**
     * Shows a break notification to the user with a snooze option.
     * The notification content changes based on whether it's a regular reminder or after a snooze.
     */
    _showBreakNotification() {
        // Calculate the actual interval that just passed to use in the notification body
        // This is based on the REMINDER_INTERVAL_MS, not the remainingSeconds
        const intervalMinutes = Math.round(this.REMINDER_INTERVAL_MS / 60 / 1000);
        const intervalSecondsDisplay = this.REMINDER_INTERVAL_MS / 1000; // Total seconds for display

        let timeText = '';
        if (intervalMinutes > 0 && (intervalSecondsDisplay % 60 !== 0)) {
            timeText = `${intervalMinutes}m ${intervalSecondsDisplay % 60}s`;
        } else if (intervalMinutes > 0) {
            timeText = `${intervalMinutes}m`;
        } else {
            timeText = `${intervalSecondsDisplay}s`;
        }

        // Create notification source if needed
        if (!this.notificationSource) {
            this.notificationSource = new MessageTray.Source({
                title: 'Break Reminder',
                icon_name: 'figure-walking-symbolic'
            });
            Main.messageTray.add(this.notificationSource);
        }

        let notificationTitle;
        let notificationBody;

        if (this.isSnoozing) {
            notificationTitle = '⏰ Snooze Over - Time to Move!';
            notificationBody = 'Your 5-minute snooze is up. Time to stretch, walk around, or do some quick exercises! 💪';
            this.isSnoozing = false; // Reset snooze state after the notification
            console.log('Break reminder: Snooze over notification shown.');
        } else {
            notificationTitle = '🏃 Time for a Movement Break!';
            notificationBody = `It's been ${timeText}. Time to stretch, walk around, or do some quick exercises! 💪`;
            console.log(`Break reminder: Regular notification shown after ${timeText}.`);
        }

        // Create notification with action button
        const notification = new MessageTray.Notification({
            source: this.notificationSource,
            title: notificationTitle,
            body: notificationBody,
            urgency: MessageTray.Urgency.HIGH
        });

        // Add the "Wait 5 minutes" action button
        notification.addAction('Wait 5 minutes', () => {
            this._waitFiveMinutes();
            // Close the current notification after snooze is activated
            notification.destroy(); 
        });

        // Show the notification with the action button
        this.notificationSource.addNotification(notification);

        // Crucial: After ANY notification (regular or snooze-over), reset the countdown
        // to the full main interval for the *next* cycle.
        this.remainingSeconds = this.REMINDER_INTERVAL_MS / 1000;
        
        // Force update display immediately to show the new full countdown
        this._updateCountdownDisplay();
        
        console.log(`Next reminder scheduled in ${this.remainingSeconds} seconds (full interval).`);
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
        
        // Show confirmation notification
        if (this.notificationSource) {
            const confirmNotification = new MessageTray.Notification({
                source: this.notificationSource,
                title: '⏰ Break Reminder Snoozed',
                body: 'You\'ll be reminded again in 5 minutes.',
                urgency: MessageTray.Urgency.NORMAL
            });
            this.notificationSource.addNotification(confirmNotification);
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
        } else {
            this.panelText.set_text(`${seconds}s`);
        }
    }

    /**
     * The main countdown timer that runs every second.
     * It decrements remainingSeconds and triggers notification when it hits zero.
     */
    _updateCountdown() {
        if (!this.isRunning) {
            return GLib.SOURCE_REMOVE; // Stop the timer if not running
        }

        if (this.remainingSeconds > 0) {
            this.remainingSeconds--;
            this._updateCountdownDisplay();
            return GLib.SOURCE_CONTINUE; // Continue running
        } else {
            // remainingSeconds has reached 0. Time to show a notification.
            this._showBreakNotification(); 
            // _showBreakNotification will handle resetting this.remainingSeconds.
            return GLib.SOURCE_CONTINUE; // Keep the timer running for the next cycle
        }
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
                this.countdownTimerId = GLib.timeout_add_seconds(
                    GLib.PRIORITY_DEFAULT,
                    1,
                    () => this._updateCountdown()
                );
                
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
        this.panelButton = new PanelMenu.Button(0.0, this.metadata.name, false);

        const box = new St.BoxLayout({
            style_class: 'break-reminder-box'
        });

        this.panelIcon = new St.Icon({
            icon_name: 'alarm-symbolic', // Timer/alarm icon
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

        // Initialize and add panel button
        this._initPanelButton();
        Main.panel.addToStatusArea(this.metadata.uuid, this.panelButton);

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

        // Clean up timers
        if (this.countdownTimerId) {
            GLib.source_remove(this.countdownTimerId);
            this.countdownTimerId = null;
        }

        // Clean up notification source
        if (this.notificationSource) {
            Main.messageTray.remove(this.notificationSource);
            this.notificationSource.destroy();
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
    }
}