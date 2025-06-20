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
        this.timerId = null;
        this.countdownTimerId = null;
        this.source = null;
        this.panelButton = null;
        this.panelText = null;
        this.panelIcon = null;
        this._settingsChangedId = null;
        this.REMINDER_INTERVAL_MS = 15 * 60 * 1000; // Default 15 minutes
        this.remainingSeconds = 0;
        this.notificationSource = null;
    }

    /**
     * Shows a break notification to the user with wait option
     */
    _showBreakNotification() {
        const totalSeconds = this.REMINDER_INTERVAL_MS / 1000;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        
        let timeText = '';
        if (minutes > 0 && seconds > 0) {
            timeText = `${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            timeText = `${minutes}m`;
        } else {
            timeText = `${seconds}s`;
        }
        
        // Create notification source if needed
        if (!this.notificationSource) {
            this.notificationSource = new MessageTray.Source({
                title: 'Movement Break Reminder',
                iconName: 'figure-walking-symbolic'
            });
            
            // Add the source to the message tray
            Main.messageTray.add(this.notificationSource);
        }

        // Create notification with action button
        const notification = new MessageTray.Notification({
            source: this.notificationSource,
            title: '🏃 Time for a Movement Break!',
            body: `It's been ${timeText}. Time to stretch, walk around, or do some quick exercises! 💪`,
            urgency: MessageTray.Urgency.HIGH
        });

        // Add the "Wait 5 minutes" action button
        notification.addAction('Wait 5 minutes', () => {
            this._waitFiveMinutes();
        });

        // Show the notification with the action button
        this.notificationSource.addNotification(notification);

        // Reset the countdown for next cycle
        this.remainingSeconds = this.REMINDER_INTERVAL_MS / 1000;
        
        // Force update display immediately
        this._updateCountdownDisplay();
        
        // Log for debugging
        console.log(`Break reminder: Reset timer to ${this.remainingSeconds} seconds`);
    }

    /**
     * Wait 5 minutes before next reminder
     */
    _waitFiveMinutes() {
        console.log('User chose to wait 5 minutes');
        
        // Set remaining time to 5 minutes
        this.remainingSeconds = 5 * 60;
        
        // Update display
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
     * Updates the countdown display in the panel
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
     * Countdown timer that updates every second and handles notifications
     */
    _updateCountdown() {
        if (!this.isRunning) {
            return GLib.SOURCE_REMOVE;
        }

        if (this.remainingSeconds > 0) {
            this.remainingSeconds--;
            this._updateCountdownDisplay();
            return GLib.SOURCE_CONTINUE;
        } else {
            // Time's up! Show notification and reset
            this._showBreakNotification();
            // Reset happens in _showBreakNotification()
            return GLib.SOURCE_CONTINUE; // Continue the timer for next cycle
        }
    }

    /**
     * Handles settings changes
     */
    _onSettingsChanged(settings, key) {
        if (key === 'interval-minutes' || key === 'interval-seconds') {
            const minutes = settings.get_int('interval-minutes');
            const seconds = settings.get_int('interval-seconds');
            this.REMINDER_INTERVAL_MS = (minutes * 60 + seconds) * 1000;

            // Restart timer if running
            if (this.isRunning) {
                // Clean up existing timers
                if (this.timerId) {
                    GLib.source_remove(this.timerId);
                    this.timerId = null;
                }
                if (this.countdownTimerId) {
                    GLib.source_remove(this.countdownTimerId);
                    this.countdownTimerId = null;
                }
                
                // Start fresh with new interval
                this.remainingSeconds = this.REMINDER_INTERVAL_MS / 1000;
                this.countdownTimerId = GLib.timeout_add_seconds(
                    GLib.PRIORITY_DEFAULT,
                    1,
                    () => this._updateCountdown()
                );
                
                this._updateCountdownDisplay();
            }
        }
    }

    /**
     * Initialize the panel button
     */
    _initPanelButton() {
        // Create panel button
        this.panelButton = new PanelMenu.Button(0.0, this.metadata.name, false);

        // Create a box layout to hold icon and text
        const box = new St.BoxLayout({
            style_class: 'break-reminder-box'
        });

        // Create timer icon
        this.panelIcon = new St.Icon({
            icon_name: 'alarm-symbolic',
            fallback_icon_name: 'appointment-soon-symbolic',
            style_class: 'break-reminder-icon',
            icon_size: 16
        });

        // Create text label with initial display based on settings
        const totalSeconds = this.REMINDER_INTERVAL_MS / 1000;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        
        let initialText = '';
        if (minutes > 0 && seconds > 0) {
            initialText = `${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            initialText = `${minutes}m`;
        } else {
            initialText = `${seconds}s`;
        }

        this.panelText = new St.Label({
            text: initialText,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'break-reminder-label'
        });

        box.add_child(this.panelIcon);
        box.add_child(this.panelText);

        // Add the box to the button
        this.panelButton.add_child(box);

        // Create menu items - only toggle and settings
        this.toggleItem = new St.Button({
            label: 'Pause Reminders', // Start with pause since auto-start is enabled
            style_class: 'break-reminder-menu-button',
            x_align: Clutter.ActorAlign.START,
            reactive: true,
            can_focus: true,
            track_hover: true
        });

        this.toggleItem.connect('clicked', () => {
            this._togglePeriodicReminder();
            this.toggleItem.label = this.isRunning ? 'Pause Reminders' : 'Start Reminders';
        });

        this.panelButton.menu.box.add_child(this.toggleItem);

        // Add settings button
        const settingsItem = new St.Button({
            label: 'Settings',
            style_class: 'break-reminder-menu-button',
            x_align: Clutter.ActorAlign.START,
            reactive: true,
            can_focus: true,
            track_hover: true
        });

        settingsItem.connect('clicked', () => {
            this.panelButton.menu.close();
            this.openPreferences();
        });

        this.panelButton.menu.box.add_child(settingsItem);
    }

    enable() {
        // Initialize settings
        this._settings = this.getSettings();
        const minutes = this._settings.get_int('interval-minutes');
        const seconds = this._settings.get_int('interval-seconds');
        this.REMINDER_INTERVAL_MS = (minutes * 60 + seconds) * 1000;

        // Initialize panel button
        this._initPanelButton();

        // Add to panel
        Main.panel.addToStatusArea(this.metadata.uuid, this.panelButton);

        // Connect settings change handlers for both minutes and seconds
        this._settingsChangedId = this._settings.connect('changed', 
            (settings, key) => this._onSettingsChanged(settings, key));

        // Auto-start reminders immediately on login
        this._togglePeriodicReminder();
    }

    disable() {
        // Clean up timers
        if (this.timerId) {
            GLib.source_remove(this.timerId);
            this.timerId = null;
        }

        if (this.countdownTimerId) {
            GLib.source_remove(this.countdownTimerId);
            this.countdownTimerId = null;
        }

        // Clean up notification source
        if (this.notificationSource) {
            // Remove from message tray first
            Main.messageTray.remove(this.notificationSource);
            this.notificationSource.destroy();
            this.notificationSource = null;
        }

        // Clean up panel button
        if (this.panelButton) {
            this.panelButton.destroy();
            this.panelButton = null;
        }

        // Disconnect settings
        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        // Clear references
        this.panelText = null;
        this.panelIcon = null;
        this._settings = null;
        this.isRunning = false;
        this.remainingSeconds = 0;
    }
}