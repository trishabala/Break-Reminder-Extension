import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Cairo from 'gi://cairo';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const BREAK_MESSAGES = [
    'Stretch your muscles — you\'ve earned it! 🧘',
    'Time for a short walk! 🚶',
    'Quick exercises, go! 💪',
    'Look away from your screen for 20 seconds. 👀',
    'Stand up and move around! 🏃',
    'Rest your eyes for a moment. 😌',
    'Shake it out — shoulders, neck, wrists! 🙌',
];

// Arc progress indicator drawn on a canvas
const ArcIndicator = GObject.registerClass(
class ArcIndicator extends St.DrawingArea {
    _init() {
        super._init({
            style_class: 'break-reminder-arc',
            width: 22,
            height: 22,
        });
        this._progress = 1.0; // 1.0 = full, 0.0 = empty
        this.connect('repaint', this._draw.bind(this));
    }

    setProgress(value) {
        this._progress = Math.max(0, Math.min(1, value));
        this.queue_repaint();
    }

    _draw(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(w, h) / 2 - 2;

        // Background track
        cr.setSourceRGBA(1, 1, 1, 0.15);
        cr.setLineWidth(2.5);
        cr.arc(cx, cy, r, 0, 2 * Math.PI);
        cr.stroke();

        // Progress arc — starts at top (-π/2), goes clockwise
        if (this._progress > 0) {
            const endAngle = -Math.PI / 2 + (2 * Math.PI * this._progress);

            // Color shifts from green → yellow → red as time runs out
            let red, green;
            if (this._progress > 0.5) {
                red = 2 * (1 - this._progress);
                green = 1;
            } else {
                red = 1;
                green = 2 * this._progress;
            }
            cr.setSourceRGBA(red, green, 0.3, 0.95);
            cr.setLineWidth(2.5);
            cr.setLineCap(Cairo.LineCap.ROUND);
            cr.arc(cx, cy, r, -Math.PI / 2, endAngle);
            cr.stroke();
        }

        cr.$dispose();
    }
});

export default class BreakReminderExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._paused = false;
        this._secondsRemaining = 0;
        this._totalSeconds = 0;
        this._timerId = null;

        // --- Panel button ---
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);

        // Horizontal box inside the panel button
        const box = new St.BoxLayout({
            style_class: 'break-reminder-box',
            vertical: false,
        });
        this._indicator.add_child(box);

        // Icon
        const icon = new St.Icon({
            icon_name: 'media-playback-start-symbolic',
            style_class: 'break-reminder-icon',
            icon_size: 14,
        });
        box.add_child(icon);

        // Arc progress ring
        this._arc = new ArcIndicator();
        box.add_child(this._arc);

        // Countdown label
        this._label = new St.Label({
            text: '--',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'break-reminder-label',
        });
        box.add_child(this._label);

        // --- Menu ---

        // Header section: next break info
        this._headerItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._headerItem.label.style_class = 'break-reminder-menu-header';
        this._indicator.menu.addMenuItem(this._headerItem);

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Pause/Resume
        this._toggleItem = new PopupMenu.PopupMenuItem(_('⏸  Pause Reminders'));
        this._toggleItem.connect('activate', () => this._togglePause());
        this._indicator.menu.addMenuItem(this._toggleItem);

        // Reset timer
        const resetItem = new PopupMenu.PopupMenuItem(_('↺  Reset Timer'));
        resetItem.connect('activate', () => this._resetTimer());
        this._indicator.menu.addMenuItem(resetItem);

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Settings
        const settingsItem = new PopupMenu.PopupMenuItem(_('⚙  Settings'));
        settingsItem.connect('activate', () => this.openPreferences());
        this._indicator.menu.addMenuItem(settingsItem);

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // Watch for interval changes
        this._settingsChangedId = this._settings.connect(
            'changed::break-interval',
            () => this._resetTimer()
        );

        this._resetTimer();
    }

    disable() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        this._indicator?.destroy();
        this._indicator = null;
        this._label = null;
        this._arc = null;
        this._toggleItem = null;
        this._headerItem = null;
        this._settings = null;
    }

    _resetTimer() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
        const intervalMinutes = this._settings.get_int('break-interval');
        this._totalSeconds = intervalMinutes * 60;
        this._secondsRemaining = this._totalSeconds;
        this._paused = false;
        this._toggleItem?.label.set_text(_('⏸  Pause Reminders'));
        this._updateDisplay();

        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            if (this._paused)
                return GLib.SOURCE_CONTINUE;

            this._secondsRemaining--;
            this._updateDisplay();

            if (this._secondsRemaining <= 0) {
                this._sendNotification();
                this._resetTimer();
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _updateDisplay() {
        if (!this._label) return;

        const m = Math.floor(this._secondsRemaining / 60);
        const s = this._secondsRemaining % 60;

        // Panel label: show Xm or Xs when under a minute
        if (m > 0) {
            this._label.set_text(`${m}m`);
        } else {
            this._label.set_text(`${s}s`);
        }

        // Arc progress
        const progress = this._totalSeconds > 0
            ? this._secondsRemaining / this._totalSeconds
            : 1;
        this._arc?.setProgress(progress);

        // Menu header
        if (this._headerItem) {
            if (this._paused) {
                this._headerItem.label.set_text('  Reminders paused');
            } else if (m > 0) {
                this._headerItem.label.set_text(`  Next break in ${m}m ${s.toString().padStart(2,'0')}s`);
            } else {
                this._headerItem.label.set_text(`  Next break in ${s}s`);
            }
        }
    }

    _togglePause() {
        this._paused = !this._paused;
        if (this._toggleItem)
            this._toggleItem.label.set_text(
                this._paused ? _('▶  Start Reminders') : _('⏸  Pause Reminders')
            );
        if (this._label)
            this._label.set_text(this._paused ? '⏸' : `${Math.floor(this._secondsRemaining / 60)}m`);
        this._arc?.setProgress(this._paused ? 0.15 : this._secondsRemaining / this._totalSeconds);
        this._updateDisplay();
    }

    _sendNotification() {
        const msg = BREAK_MESSAGES[Math.floor(Math.random() * BREAK_MESSAGES.length)];
        Main.notify(_('Movement Break! 🏃'), msg);
    }
}
