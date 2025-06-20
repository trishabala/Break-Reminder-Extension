// prefs.js
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class BreakReminderPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // Get settings
        const settings = this.getSettings();

        // Create preferences page
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        // Create timing group
        const timingGroup = new Adw.PreferencesGroup({
            title: 'Break Reminder Timing',
            description: 'Configure how often you want to be reminded to take breaks',
        });
        page.add(timingGroup);

        // Minutes row
        const minutesRow = new Adw.ActionRow({
            title: 'Minutes',
            subtitle: 'Break reminder interval in minutes',
        });

        const minutesSpinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 120,
                step_increment: 1,
                page_increment: 5,
                value: settings.get_int('interval-minutes'),
            }),
            valign: Gtk.Align.CENTER,
        });

        // Bind settings
        settings.bind(
            'interval-minutes',
            minutesSpinButton,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        minutesRow.add_suffix(minutesSpinButton);
        timingGroup.add(minutesRow);

        // Seconds row
        const secondsRow = new Adw.ActionRow({
            title: 'Seconds',
            subtitle: 'Additional seconds to add to the interval',
        });

        const secondsSpinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 59,
                step_increment: 1,
                page_increment: 5,
                value: settings.get_int('interval-seconds'),
            }),
            valign: Gtk.Align.CENTER,
        });

        // Bind settings
        settings.bind(
            'interval-seconds',
            secondsSpinButton,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        secondsRow.add_suffix(secondsSpinButton);
        timingGroup.add(secondsRow);

        // Add example row showing total time
        const exampleRow = new Adw.ActionRow({
            title: 'Current Total Interval',
            subtitle: this._formatTotalTime(settings.get_int('interval-minutes'), settings.get_int('interval-seconds')),
        });
        timingGroup.add(exampleRow);

        // Update example when settings change
        const updateExample = () => {
            const minutes = settings.get_int('interval-minutes');
            const seconds = settings.get_int('interval-seconds');
            exampleRow.subtitle = this._formatTotalTime(minutes, seconds);
        };

        settings.connect('changed::interval-minutes', updateExample);
        settings.connect('changed::interval-seconds', updateExample);

        // Add info group
        const infoGroup = new Adw.PreferencesGroup({
            title: 'About',
        });
        page.add(infoGroup);

        const aboutRow = new Adw.ActionRow({
            title: 'Break Reminder Extension',
            subtitle: 'Helps you remember to take regular movement breaks for better health and productivity.',
        });
        infoGroup.add(aboutRow);

        const featuresRow = new Adw.ActionRow({
            title: 'Features',
            subtitle: '• Customizable reminder intervals\n• Snooze functionality (5 minutes)\n• Panel countdown display\n• Auto-start on login',
        });
        infoGroup.add(featuresRow);
    }

    _formatTotalTime(minutes, seconds) {
        if (minutes === 0 && seconds === 0) {
            return 'Timer disabled (0 seconds)';
        }
        
        let parts = [];
        if (minutes > 0) {
            parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
        }
        if (seconds > 0) {
            parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
        }
        
        return parts.join(' and ');
    }
}