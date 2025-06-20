// prefs.js - Settings UI for Break Reminder Extension
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio'; // Required for settings binding
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class BreakReminderPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // Create preferences page
        const page = new Adw.PreferencesPage({
            title: 'Break Reminder Settings', // More descriptive title
            icon_name: 'view-refresh-symbolic' // Refresh icon suggests movement/activity
        });
        window.add(page);

        // Create preferences group
        const group = new Adw.PreferencesGroup({
            title: 'Movement Break Timing', // Combined title for both minutes and seconds
            description: 'Configure how often you want to be reminded to take movement breaks.'
        });
        page.add(group);

        // --- Minutes Interval Setting ---
        const minutesRow = new Adw.ActionRow({
            title: 'Minutes',
            subtitle: 'Set the main interval in minutes.',
        });

        const minutesSpinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0, // Allow 0 minutes if seconds are used
                upper: 240, // Up to 4 hours
                step_increment: 1,
                page_increment: 5,
                value: settings.get_int('interval-minutes')
            }),
            valign: Gtk.Align.CENTER,
        });

        // Connect the spin button to settings using Gtk.SpinButton's 'value' property
        settings.bind(
            'interval-minutes',
            minutesSpinButton,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        minutesRow.add_suffix(minutesSpinButton);
        group.add(minutesRow);

        // --- Seconds Interval Setting ---
        const secondsRow = new Adw.ActionRow({
            title: 'Seconds',
            subtitle: 'Add additional seconds to the interval.',
        });

        const secondsSpinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 59, // Max 59 seconds
                step_increment: 1,
                page_increment: 5,
                value: settings.get_int('interval-seconds')
            }),
            valign: Gtk.Align.CENTER,
        });

        // Connect the spin button to settings
        settings.bind(
            'interval-seconds',
            secondsSpinButton,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        secondsRow.add_suffix(secondsSpinButton);
        group.add(secondsRow);

        // --- Current Total Interval Display ---
        const totalIntervalRow = new Adw.ActionRow({
            title: 'Current Total Interval',
            subtitle: this._formatTotalTime(
                settings.get_int('interval-minutes'),
                settings.get_int('interval-seconds')
            ),
        });
        group.add(totalIntervalRow);

        // Update the total interval display when minutes or seconds change
        const updateDisplay = () => {
            const minutes = settings.get_int('interval-minutes');
            const seconds = settings.get_int('interval-seconds');
            totalIntervalRow.subtitle = this._formatTotalTime(minutes, seconds);
        };

        settings.connect('changed::interval-minutes', updateDisplay);
        settings.connect('changed::interval-seconds', updateDisplay);

        // --- General Info Row (from original file) ---
        const infoRow = new Adw.ActionRow({
            title: 'Stay Active & Healthy! 💪',
            subtitle: 'The extension will remind you to move, stretch, or do quick exercises at regular intervals. Click the timer icon in the panel to start/pause reminders.',
        });
        group.add(infoRow);
    }

    /**
     * Helper function to format the total time for display.
     * @param {number} minutes
     * @param {number} seconds
     * @returns {string} Formatted string like "15 minutes and 30 seconds"
     */
    _formatTotalTime(minutes, seconds) {
        if (minutes === 0 && seconds === 0) {
            return 'Reminder interval is set to 0. Reminders will not trigger.';
        }
        
        let parts = [];
        if (minutes > 0) {
            parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
        }
        if (seconds > 0) {
            parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
        }
        
        return `Current interval: ${parts.join(' and ')}.`;
    }
}