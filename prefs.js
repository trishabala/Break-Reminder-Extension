// prefs.js - Settings UI for Break Reminder Extension
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class BreakReminderPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // Create preferences page
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'view-refresh-symbolic'
        });
        window.add(page);

        // Create preferences group
        const group = new Adw.PreferencesGroup({
            title: 'Movement Break Settings',
            description: 'Configure your movement break reminders to stay healthy and active! 🏃‍♀️'
        });
        page.add(group);

        // Create spin button for interval setting
        const intervalRow = new Adw.SpinRow({
            title: 'Movement Break Interval',
            subtitle: 'Minutes between movement reminders',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 240,
                step_increment: 1,
                page_increment: 5,
                value: settings.get_int('interval-minutes')
            })
        });

        // Connect the spin button to settings
        intervalRow.connect('notify::value', (widget) => {
            settings.set_int('interval-minutes', widget.get_value());
        });

        // Add the row to the group
        group.add(intervalRow);

        // Create info row
        const infoRow = new Adw.ActionRow({
            title: 'Stay Active & Healthy! 💪',
            subtitle: 'The extension will remind you to move, stretch, or do quick exercises at regular intervals. Click the walking icon in the panel to start/pause reminders.'
        });
        group.add(infoRow);
    }
}