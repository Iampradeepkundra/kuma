/**
 * This file defines a React Banner component that renders a
 * call-to-action banner fixed to the bottom of the screen. The props
 * of the Banner component allow customization of the title,
 * description and button call-to-action text of the banner, as well
 * as the URL of the page that clicking on the call-to-action button
 * takes the user to. The Banner component is not exported,
 * however. Instead, we export an ActiveBanner component that pages should
 * use. It loops through an array of banner IDs for the first banner that is enabled by
 * Waffle and has not been dismissed by the user. If it finds such a
 * banner, it displays it with a <Banner>. Otherwise, if none of the
 * specified banners is enabled, or if all enabled banners have been
 * recently dismissed, then it displays nothing.
 *
 * When we want to change the set of banners displayed on MDN, we
 * can just edit the array of BannerProps objects in Banners() below.
 *
 * This file is a React port of the code in the following files:
 *
 *   kuma/banners/jinja2/banners/cta-banners.html
 *   kuma/banners/jinja2/banners/developer-needs.html
 *   kuma/static/js/components/banners/banners.js
 *   kuma/static/js/components/banners/utils/banners-event-util.js
 *   kuma/static/js/components/banners/utils/banners-state-util.js
 *
 * If you make changes in this file and also want those changes to be
 * reflected on the wiki site, you will need to edit those older files
 * as well.
 *
 * The reason that this React-based version of the banner feature is needed
 * is that in order to cache our pages in the CDN, we can't use waffle
 * flags in our HTML templates and instead have to modify all waffle-related
 * logic to query waffle flags obtained from the <UserProvider> context.
 *
 * This port removes the minimize feature from banners since it is
 * not used by the developer needs survey and seems unlikely to be
 * needed for future banners (it was part of the experimental payments
 * banner.)
 *
 * This ported component does not use CSS-in-JS, and depends on the
 * original banners stylesheet built from:
 *
 *    kuma/static/styles/components/banners/base.scss
 *
 * TODO: copy the styles from that stylesheet directly into this
 * component so that we only need to emit them (and the browser only
 * needs to parse them) when a banner will actually be rendered.
 *
 * @flow
 */
import * as React from 'react';
import { useContext, useEffect, useState } from 'react';

import CloseIcon from './icons/close.svg';
import { getLocale, gettext, interpolate } from './l10n.js';
import UserProvider from './user-provider.jsx';
import GAProvider, {
    CATEGORY_MONTHLY_PAYMENTS,
    gaSendOnNextPage,
} from './ga-provider.jsx';
import { formatMoney } from './formatters.js';

// Set a localStorage key with a timestamp the specified number of
// days into the future. When the user dismisses a banner we use this
// to prevent the redisplay of the banner for a while.
function setEmbargoed(id, days) {
    try {
        let key = `banner.${id}.embargoed_until`;
        localStorage.setItem(
            key,
            String(Date.now() + Math.round(days * 24 * 60 * 60 * 1000))
        );
    } catch (e) {
        // If localStorage is not supported, then embargos are not supported.
    }
}

// See whether the specified id was passed to setEmbargoed() fewer than the
// specified number of days ago. We check this before displaying a banner
// so a user does not see a banner they recently dismissed.
function isEmbargoed(id) {
    try {
        let key = `banner.${id}.embargoed_until`;
        let value = localStorage.getItem(key);
        // If it is not set, then the banner has never been dismissed
        if (!value) {
            return false;
        }
        // The value from localStorage is a timestamp that we compare to
        // the current time
        if (parseInt(value) > Date.now()) {
            // If the timestamp is in the future then the banner has been
            // dismissed and the embargo has not yet expired.
            return true;
        } else {
            // Otherwise, the banner was dismissed, but the embargo has
            // expired and we can show it again.
            localStorage.removeItem(key);
            return false;
        }
    } catch (e) {
        // If localStorage is not supported, then the embargo feature
        // just won't work
        return false;
    }
}

// The <Banner> component displays a simple call-to-action banner at
// the bottom of the window. The following props allow it to be customized.
//
// TODO: we should probably make the image and maybe the background of
// the banner configurable through props like these. For now, however,
// that is hardcoded into the stylesheet.
export type BannerProps = {
    // A unique string associated with this banner. It must match the
    // name of the waffle flag that controls the banner, and is also
    // used as part of a localStorage key.
    id: string,
    // class name used on main banner container. Exclusively used
    // for styling purposes.
    classname: string,
    // The banner title. e.g. "MDN Survey"
    title?: string,
    // The banner description. e.g. "Help us understand the top 10 needs..."
    // Could also be a React Element such as that returned by `<Interpolated />`
    copy: Object | string,
    // The call to action button text. e.g. "Take the survey"
    cta: string,
    // The URL of the page to open when the button is clicked
    url: string,
    // An optional property. If present, it specifies the number of days
    // for which a dismissed banner will not be shown. If omitted, the
    // default is 5 days.
    embargoDays?: number,
    // An optional property. If present, it should be set to true to indicate
    // that the main cta link should open in a new window
    newWindow?: boolean,
    // an optional property. If present, it will be called when the CTA
    // link is clicked
    onCTAClick?: (event: SyntheticEvent<HTMLAnchorElement>) => any,
};

function Banner(props: BannerProps) {
    const [isDismissed, setDismissed] = useState(false);
    const containerClassNames = `${props.classname} mdn-cta-container cta-background-linear`;

    if (isDismissed) {
        return null;
    }

    return (
        <div className={containerClassNames}>
            <div id="mdn-cta-content" className="mdn-cta-content">
                <div id={props.id} className="mdn-cta-content-container">
                    {props.title && (
                        <h2 className="mdn-cta-title slab-text">
                            {props.title}
                        </h2>
                    )}
                    <p className="mdn-cta-copy">{props.copy}</p>
                </div>
                <p className="mdn-cta-button-container">
                    <a
                        href={props.url}
                        className="mdn-cta-button"
                        target={props.newWindow && '_blank'}
                        rel={props.newWindow && 'noopener noreferrer'}
                        onClick={props.onCTAClick}
                    >
                        {props.cta}
                    </a>
                </p>
            </div>
            <div className="mdn-cta-controls">
                <button
                    type="button"
                    id="mdn-cta-close"
                    className="mdn-cta-close"
                    aria-label={gettext('Close banner')}
                    onClick={() => {
                        setDismissed(true);
                        setEmbargoed(props.id, props.embargoDays || 5);
                    }}
                >
                    <CloseIcon className="icon icon-close" />
                </button>
            </div>
        </div>
    );
}

export const MDN_BROWSER_COMPAT_REPORT_ID = 'mdn_browser_compat_report';
export const DEVELOPER_NEEDS_ID = 'developer_needs';
export const SUBSCRIPTION_ID = 'subscription_banner';

function MDNBrowserCompatReportBanner() {
    const ga = useContext(GAProvider.context);

    return (
        <Banner
            id={MDN_BROWSER_COMPAT_REPORT_ID}
            classname="developer-needs"
            title={gettext('MDN Browser Compatibility Report')}
            copy={
                <>
                    A deep dive into web compatibility frustrations, with useful{' '}
                    <a
                        href="https://insights.developer.mozilla.org/"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        insights
                    </a>{' '}
                    into how they could be overcome.
                </>
            }
            cta={gettext('Read the report (PDF, 1.8mb)')}
            url={
                'https://mdn-web-dna.s3-us-west-2.amazonaws.com/MDN-Browser-Compatibility-Report-2020.pdf'
            }
            onCTAClick={() => {
                ga('send', {
                    hitType: 'event',
                    eventCategory: MDN_BROWSER_COMPAT_REPORT_ID,
                    eventAction: 'Browser Compat Report 2020 CTA clicked',
                    eventLabel: 'banner',
                });
            }}
            newWindow
        />
    );
}

function DeveloperNeedsBanner() {
    return (
        <Banner
            id={DEVELOPER_NEEDS_ID}
            classname="developer-needs"
            title={gettext('MDN Web DNA')}
            copy={gettext(
                'Help us understand the top 10 needs of Web developers and designers.'
            )}
            cta={gettext('Take the survey')}
            url={
                'https://qsurvey.mozilla.com/s3/Developer-Needs-Assessment-2019'
            }
            newWindow
        />
    );
}

function SubscriptionBanner() {
    const ga = useContext(GAProvider.context);
    const locale = getLocale();

    useEffect(() => {
        ga('send', {
            hitType: 'event',
            eventCategory: CATEGORY_MONTHLY_PAYMENTS,
            eventAction: 'CTA shown',
            eventLabel: 'banner',
        });
    }, [ga]);

    return (
        <Banner
            id={SUBSCRIPTION_ID}
            classname="mdn-subscriptions"
            title={gettext('Become a monthly supporter')}
            copy={interpolate(
                gettext('Support MDN with a %(amount)s monthly subscription'),
                {
                    amount: formatMoney(locale, 5),
                }
            )}
            cta={gettext('Learn more')}
            url={`/${locale}/payments/`}
            onCTAClick={() => {
                gaSendOnNextPage([
                    {
                        hitType: 'event',
                        eventCategory: CATEGORY_MONTHLY_PAYMENTS,
                        eventAction: 'subscribe intent',
                        eventLabel: 'banner',
                    },
                ]);
            }}
            embargoDays={7}
        />
    );
}

export default function ActiveBanner() {
    const userData = useContext(UserProvider.context);

    if (!userData || !userData.waffle.flags || !userData.waffle.switches) {
        return null;
    }

    const isEnabled = (id) =>
        (userData.waffle.flags[id] || userData.waffle.switches[id]) &&
        !isEmbargoed(id);

    // The order of the if statements is important and it's our source of
    // truth about which banner is "more important" than the other.
    if (isEnabled(MDN_BROWSER_COMPAT_REPORT_ID)) {
        return <MDNBrowserCompatReportBanner />;
    } else if (isEnabled(DEVELOPER_NEEDS_ID)) {
        return <DeveloperNeedsBanner />;
    } else if (isEnabled(SUBSCRIPTION_ID) && !userData.isSubscriber) {
        return <SubscriptionBanner />;
    }
    // No banner found in the waffle flags, so we have nothing to render
    return null;
}
