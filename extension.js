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
        this._settingsChangedId = null;
        this.REMINDER_INTERVAL_MS = 15 * 60 * 1000; // Default 15 minutes
        this.remainingSeconds = 0;
    }

    /**
     * Shows a break notification to the user
     */
    _showBreakNotification() {
        // Create notification source if it doesn't exist
        if (!this.source) {
            this.source = new MessageTray.Source({
                title: 'Movement Break Reminder',
                iconName: 'figure-walking-symbolic'
            });
            Main.messageTray.addSource(this.source);
        }

        const intervalMinutes = Math.round(this.REMINDER_INTERVAL_MS / 60 / 1000);
        
        const notification = new MessageTray.Notification({
            source: this.source,
            title: '🏃 Time for a Movement Break!',
            body: `It's been ${intervalMinutes} minutes. Time to stretch, walk around, or do some quick exercises! 💪`,
            urgency: MessageTray.Urgency.HIGH
        });

        this.source.addNotification(notification);

        // Reset the countdown for next cycle
        this.remainingSeconds = this.REMINDER_INTERVAL_MS / 1000;
        this._updateCountdownDisplay();
    }

    /**
     * Updates the countdown display in the panel
     */
    _updateCountdownDisplay() {
        if (!this.panelText || !this.isRunning) return;

        const minutes = Math.floor(this.remainingSeconds / 60);
        const seconds = this.remainingSeconds % 60;
        
        if (minutes > 0) {
            this.panelText.set_text(`${minutes}m`);
        } else {
            this.panelText.set_text(`${seconds}s`);
        }
    }

    /**
     * Countdown timer that updates every second and handles notifications
     */
    _updateCountdown() {
        if (this.remainingSeconds > 0) {
            this.remainingSeconds--;
            this._updateCountdownDisplay();
            return GLib.SOURCE_CONTINUE;
        } else {
            // Time's up! Show notification and reset
            this._showBreakNotification();
            return GLib.SOURCE_CONTINUE; // Continue the timer for next cycle
        }
    }

    /**
     * Toggles the periodic reminder on/off
     */
    _togglePeriodicReminder() {
        this.isRunning = !this.isRunning;

        if (this.isRunning) {
            // Clean up any existing timers
            if (this.timerId) {
                GLib.source_remove(this.timerId);
                this.timerId = null;
            }
            if (this.countdownTimerId) {
                GLib.source_remove(this.countdownTimerId);
                this.countdownTimerId = null;
            }
            
            // Start with full countdown
            this.remainingSeconds = this.REMINDER_INTERVAL_MS / 1000;
            
            // Start single countdown timer that handles both countdown and notifications
            this.countdownTimerId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                1,
                () => this._updateCountdown()
            );

            // Update panel appearance - running state
            if (this.panelButton && this.panelText) {
                this.panelButton.add_style_class_name('break-reminder-active');
                this.panelButton.remove_style_class_name('break-reminder-paused');
                this._updateCountdownDisplay();
            }
        } else {
            // Stop the reminder
            if (this.timerId) {
                GLib.source_remove(this.timerId);
                this.timerId = null;
            }

            if (this.countdownTimerId) {
                GLib.source_remove(this.countdownTimerId);
                this.countdownTimerId = null;
            }

            // Update panel appearance - paused state
            if (this.panelButton && this.panelText) {
                this.panelButton.add_style_class_name('break-reminder-paused');
                this.panelButton.remove_style_class_name('break-reminder-active');
                this.panelText.set_text('Paused');
            }
        }
    }

    /**
     * Handles settings changes
     */
    _onSettingsChanged(settings, key) {
        if (key === 'interval-minutes') {
            const newInterval = settings.get_int('interval-minutes');
            this.REMINDER_INTERVAL_MS = newInterval * 60 * 1000;

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

        // Create cute movement/exercise icon - changed from gears to a timer/clock icon
        this.panelIcon = new St.Icon({
            icon_name: 'alarm-symbolic',
            fallback_icon_name: 'appointment-soon-symbolic', // Fallback to appointment icon
            style_class: 'break-reminder-icon',
            icon_size: 16
        });

        // Create text label
        this.panelText = new St.Label({
            text: '15m',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'break-reminder-label'
        });

        box.add_child(this.panelIcon);
        box.add_child(this.panelText);

        // Add the box to the button
        this.panelButton.add_child(box);

        // Create menu items - only toggle button, no settings button
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

        // Add simple settings button
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
        this.REMINDER_INTERVAL_MS = this._settings.get_int('interval-minutes') * 60 * 1000;

        // Initialize panel button
        this._initPanelButton();

        // Add to panel
        Main.panel.addToStatusArea(this.metadata.uuid, this.panelButton);

        // Connect settings change handler
        this._settingsChangedId = this._settings.connect('changed::interval-minutes', 
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
        if (this.source) {
            this.source.destroy();
            this.source = null;
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
        this._settings = null;
        this.isRunning = false;
        this.remainingSeconds = 0;
    }
}