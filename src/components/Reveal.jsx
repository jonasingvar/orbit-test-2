import { useInView } from '../lib/useInView.js';
import { cx } from './ui.jsx';

/** Wraps a block so it fades and lifts into place the first time it is scrolled to. */
export function Reveal({ children, className, delay = 0, as: As = 'div', ...rest }) {
  const [ref, visible] = useInView();
  return (
    <As ref={ref} data-visible={visible} style={{ '--i': delay }} className={cx('reveal', className)} {...rest}>
      {children}
    </As>
  );
}
