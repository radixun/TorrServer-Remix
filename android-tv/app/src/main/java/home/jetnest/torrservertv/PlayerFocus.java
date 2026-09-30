package home.jetnest.torrservertv;

import android.app.AlertDialog;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.graphics.drawable.StateListDrawable;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.ListView;

import androidx.annotation.OptIn;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.ui.DefaultTimeBar;

/** Focus follows each native control's shape; the time bar uses its own scrubber. */
@OptIn(markerClass = UnstableApi.class)
final class PlayerFocus {
    private PlayerFocus() {}

    static void apply(View view) {
        // PlayerView is a clickable, focusable full-screen ViewGroup. Decorating
        // containers outlines the entire film when controls disappear.
        if (view instanceof DefaultTimeBar) {
            DefaultTimeBar bar = (DefaultTimeBar) view;
            bar.setOnFocusChangeListener((v, focused) -> {
                // Media3 already enlarges the scrubber on focus. Add a quiet accent,
                // without drawing a full-width box around the seek target.
                int color = focused ? 0xffc8e6f5 : android.graphics.Color.WHITE;
                bar.setScrubberColor(color);
                bar.setPlayedColor(color);
            });
        } else if (view.isFocusable() && !(view instanceof ViewGroup)) {
            boolean round = view instanceof ImageView
                    || view.getId() == androidx.media3.ui.R.id.exo_rew_with_amount
                    || view.getId() == androidx.media3.ui.R.id.exo_ffwd_with_amount;
            Drawable outline = round ? circle(view) : view.getContext().getDrawable(R.drawable.player_focus);
            Drawable existing = view.getForeground();
            // Media3 uses foreground drawables for the rewind/forward icons.
            view.setForeground(existing == null ? outline : new LayerDrawable(new Drawable[]{existing, outline}));
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) apply(group.getChildAt(i));
        }
    }

    private static Drawable circle(View view) {
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setColor(0x143b526a);
        ring.setStroke(Math.round(2 * view.getResources().getDisplayMetrics().density), 0xe6ffffff);
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_focused}, ring);
        states.addState(new int[]{android.R.attr.state_pressed}, ring);
        return states;
    }

    static void show(AlertDialog dialog) {
        dialog.show();
        apply(dialog.getWindow().getDecorView());
        ListView list = dialog.getListView();
        if (list != null) {
            // ListView paints its selector behind the currently navigated row.
            list.setSelector(R.drawable.player_focus_ring);
            list.requestFocus();
            list.setSelection(Math.max(0, list.getCheckedItemPosition()));
        }
    }
}
