export const homeStyles = `.home-portal-page { background: #f4f5f7; padding-block: 18px 48px; }
.home-portal-shell { width: min(100%, 1200px); margin-inline: auto; padding-inline: 16px; }
.home-portal-hero { display: grid; gap: 10px; }
.home-portal-heroMain { display: flex; min-width: 0; min-height: 320px; flex-direction: column; border: 1px solid #dce9d9; border-radius: 5px; background: #eaf2e8; padding: clamp(20px, 3vw, 32px); }
.home-portal-kicker { margin: 0; color: #17682d; font-size: 13px; font-weight: 700; letter-spacing: .04em; }
.home-portal-heroTitle { margin: 8px 0 0; color: #173521; font-size: clamp(26px, 2.8vw, 34px); line-height: 1.26; }
.home-portal-heroIntro { max-width: 580px; margin: 12px 0 0; color: #45544a; font-size: 14px; line-height: 1.75; }
.home-portal-heroSearch { display: flex; min-width: 0; margin-top: auto; padding-top: 18px; }
.home-portal-heroSearch input, .home-portal-queryForm input { min-width: 0; flex: 1; border: 1px solid #c8d6c7; border-radius: 4px 0 0 4px; background: #fff; padding: 0 14px; color: #173521; font-size: 14px; }
.home-portal-heroSearch input { min-height: 48px; }
.home-portal-heroSearch input:focus, .home-portal-queryForm input:focus { outline: 2px solid #378821; outline-offset: -2px; }
.home-portal-heroSearch button, .home-portal-queryForm button { min-height: 48px; flex: none; border: 1px solid #378821; border-radius: 0 4px 4px 0; background: #378821; padding-inline: 21px; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; }
.home-portal-heroSearch button:hover, .home-portal-queryForm button:hover { background: #286b19; }
.home-portal-heroFoot { margin: 10px 0 0; color: #4a6251; font-size: 12px; line-height: 1.5; }
.home-portal-quickGrid { display: grid; gap: 10px; }
.home-portal-quickCard { display: flex; min-width: 0; min-height: 150px; align-items: center; gap: 12px; border: 1px solid #e3e7e2; border-radius: 5px; background: #fff; padding: 16px; color: #1e3022; text-decoration: none; transition: border-color .15s ease, box-shadow .15s ease; }
.home-portal-quickCard:hover { border-color: #93bb8a; box-shadow: 0 3px 10px #22432217; color: #17682d; }
.home-portal-quickGlyph { display: grid; flex: none; width: 50px; height: 50px; place-items: center; border-radius: 5px; background: #eaf5e7; color: #2c7a21; font-size: 23px; font-weight: 700; }
.home-portal-quickText { display: block; min-width: 0; }
.home-portal-quickText strong { display: block; color: #243a29; font-size: 17px; line-height: 1.4; }
.home-portal-quickText strong span { color: #378821; }
.home-portal-quickText small { display: block; margin-top: 6px; color: #667269; font-size: 12px; line-height: 1.55; }
.home-portal-hotLinks { display: flex; min-width: 0; align-items: center; gap: 16px; margin-top: 16px; border: 1px solid #e4e7e3; border-radius: 5px; background: #fff; padding: 7px 16px; }
.home-portal-hotLinks > strong { flex: none; border-inline-end: 1px solid #d8dfd7; padding-inline-end: 16px; color: #17682d; font-size: 13px; }
.home-portal-hotLinks > div { display: flex; min-width: 0; flex-wrap: wrap; gap: 3px 18px; }
.home-portal-hotLinks a { display: inline-flex; min-height: 33px; align-items: center; color: #46554a; font-size: 13px; text-decoration: none; }
.home-portal-hotLinks a:hover { color: #17682d; text-decoration: underline; }
.home-portal-queryModule { display: grid; min-width: 0; margin-top: 20px; border: 1px solid #e4e7e3; border-radius: 5px; background: #fff; overflow: hidden; }
.home-portal-queryMenu { display: flex; min-width: 0; flex-wrap: wrap; align-content: start; background: #eef0ed; padding: 8px; }
.home-portal-queryMenu h3 { width: 100%; margin: 4px 8px 10px; color: #245b29; font-size: 16px; }
.home-portal-queryMenu a { display: flex; min-height: 42px; align-items: center; justify-content: space-between; gap: 8px; border-radius: 3px; padding: 8px 12px; color: #39453b; font-size: 14px; text-decoration: none; }
.home-portal-queryMenu a:hover, .home-portal-queryMenu a.home-portal-menuActive { background: #378821; color: #fff; }
.home-portal-queryMenu a span { font-size: 18px; line-height: 1; }
.home-portal-queryBody { min-width: 0; padding: clamp(18px, 2.3vw, 28px); }
.home-portal-queryIntro, .home-portal-regionIndexHeading { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 8px 20px; }
.home-portal-sectionEyebrow { margin: 0 0 3px; color: #23802b; font-size: 12px; font-weight: 700; }
.home-portal-queryIntro h3, .home-portal-regionIndexHeading h3 { margin: 0; color: #203125; font-size: clamp(18px, 2vw, 23px); line-height: 1.4; }
.home-portal-queryIntro > a, .home-portal-regionIndexHeading > a { color: #17682d; font-size: 13px; font-weight: 700; text-decoration: none; }
.home-portal-queryIntro > a:hover, .home-portal-regionIndexHeading > a:hover { text-decoration: underline; }
.home-portal-queryForm { margin-top: 21px; }
.home-portal-queryForm label { display: block; margin-bottom: 8px; color: #334036; font-size: 13px; font-weight: 700; }
.home-portal-queryForm > div { display: flex; min-width: 0; max-width: 720px; }
.home-portal-regionShortcuts { margin-top: 24px; border-top: 1px solid #e6ebe5; padding-top: 18px; }
.home-portal-shortcutHeading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 16px; }
.home-portal-shortcutHeading strong { margin: 0; color: #25402a; font-size: 16px; }
.home-portal-shortcutHeading span { color: #788078; font-size: 12px; }
.home-portal-regionShortcuts ul, .home-portal-regionIndex ul { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 12px; margin: 10px 0 0; padding: 0; list-style: none; }
.home-portal-regionShortcuts a, .home-portal-regionIndex li a { display: inline-flex; min-height: 34px; align-items: center; color: #35513a; font-size: 13px; text-decoration: none; }
.home-portal-regionShortcuts a:hover, .home-portal-regionIndex li a:hover { color: #17682d; text-decoration: underline; }
.home-portal-queryCaveat { margin: 19px 0 0; border-top: 1px solid #e6ebe5; padding-top: 12px; color: #68746a; font-size: 12px; line-height: 1.65; }
.home-portal-onlinePanel, .home-portal-regionIndex { margin-top: 20px; border: 1px solid #e4e7e3; border-radius: 5px; background: #fff; padding: clamp(18px, 2.3vw, 28px); }
.home-portal-regionIndex > p { margin: 8px 0 16px; color: #59665c; font-size: 13px; line-height: 1.65; }
.home-portal-regionIndex details { border: 1px solid #e3e9e1; border-radius: 4px; }
.home-portal-regionIndex summary { display: flex; min-height: 42px; cursor: pointer; align-items: center; justify-content: space-between; padding-inline: 14px; color: #314535; font-size: 14px; font-weight: 700; list-style: none; }
.home-portal-regionIndex summary::-webkit-details-marker { display: none; }
.home-portal-regionIndex ul { grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; border-top: 1px solid #e3e9e1; padding: 14px; }
.home-portal-entrances { display: grid; gap: 10px; margin-top: 20px; }
.home-portal-entrances a { display: flex; min-height: 112px; flex-direction: column; justify-content: center; gap: 6px; border: 1px solid #e4e7e3; border-radius: 5px; background: #fff; padding: 18px; color: #243a29; text-decoration: none; }
.home-portal-entrances a:hover { border-color: #93bb8a; box-shadow: 0 3px 10px #22432217; }
.home-portal-entrances strong { font-size: 15px; }
.home-portal-entrances span { color: #68746a; font-size: 12px; line-height: 1.6; }
.home-portal-entrances b { color: #378821; }
@media (min-width: 600px) { .home-portal-quickGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .home-portal-regionShortcuts ul { grid-template-columns: repeat(4, minmax(0, 1fr)); } .home-portal-regionIndex ul { grid-template-columns: repeat(4, minmax(0, 1fr)); } .home-portal-entrances { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 760px) { .home-portal-queryModule { grid-template-columns: 160px minmax(0, 1fr); } .home-portal-queryMenu { display: block; padding: 12px 0; } .home-portal-queryMenu h3 { width: auto; margin: 4px 18px 12px; } .home-portal-queryMenu a { min-height: 48px; border-radius: 0; padding-inline: 18px; } }
@media (min-width: 1024px) { .home-portal-hero { grid-template-columns: minmax(0, 717fr) minmax(0, 473fr); } .home-portal-quickGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, 1fr); } .home-portal-quickCard { min-height: 0; } .home-portal-regionIndex ul { grid-template-columns: repeat(6, minmax(0, 1fr)); } .home-portal-entrances { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (max-width: 399px) { .home-portal-heroSearch, .home-portal-queryForm > div { flex-direction: column; } .home-portal-heroSearch input, .home-portal-queryForm input { border-radius: 4px 4px 0 0; } .home-portal-heroSearch button, .home-portal-queryForm button { border-radius: 0 0 4px 4px; } .home-portal-hotLinks { align-items: flex-start; flex-direction: column; gap: 4px; } .home-portal-hotLinks > strong { border: 0; padding: 0; } .home-portal-quickCard { min-height: 105px; } }
@media (prefers-reduced-motion: reduce) { .home-portal-quickCard { transition: none; } }
.home-portal-jump { display: flex; flex-wrap: wrap; align-items: center; gap: 0 14px; margin-top: 14px; border-top: 1px solid #dce9d9; }
.home-portal-jump > span { flex: none; color: #4a6251; font-size: 13px; font-weight: 700; }
.home-portal-jump a { display: inline-flex; min-height: 44px; align-items: center; color: #17682d; font-size: 14px; font-weight: 700; text-underline-offset: 4px; }
.home-portal-jump a:focus-visible { outline: 2px solid #378821; outline-offset: 2px; }
.home-portal-stage { min-width: 0; margin-top: clamp(32px, 4.5vw, 58px); border-top: 1px solid #e4e7e3; padding-top: clamp(19px, 2.5vw, 30px); scroll-margin-top: 20px; }
.home-portal-stageHeading { margin-bottom: 16px; border-inline-start: 4px solid #378821; padding-inline-start: 14px; }
.home-portal-stageHeading h2 { margin: 0; color: #203125; font-size: clamp(23px, 2.3vw, 29px); line-height: 1.25; font-weight: 750; }
.home-portal-stageHeading p { margin: 7px 0 0; color: #45544a; font-size: 14px; line-height: 1.6; }
.home-portal-stage > .home-portal-queryModule, .home-portal-stage > .home-portal-hotLinks, .home-portal-stage > .home-portal-regionIndex { margin-top: 0; }
@media (max-width: 599px) {
  .home-portal-heroMain { min-height: 0; }
  .home-portal-queryMenu a { min-height: 44px; }
  .home-portal-jump { gap: 0 11px; }
}
@media (min-width: 360px) and (max-width: 599px) {
  .home-portal-quickGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .home-portal-quickCard { min-height: 108px; flex-direction: column; align-items: flex-start; justify-content: flex-start; gap: 7px; padding: 11px; }
  .home-portal-quickGlyph { width: 31px; height: 31px; font-size: 16px; }
  .home-portal-quickText strong { font-size: 15px; }
  .home-portal-quickText small { margin-top: 3px; }
}
.home-portal-jump a { text-decoration: underline; }
@media (max-width: 599px) {
  .home-portal-jump { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 3px; padding-top: 9px; }
  .home-portal-jump > span { grid-column: 1 / -1; }
  .home-portal-jump a { font-size: 13px; justify-content: center; text-align: center; }
}
@media (max-width: 359px) { .home-portal-jump a { font-size: 12px; } }

`;