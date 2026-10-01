import axios from 'axios'
import Button from '@material-ui/core/Button'
import Switch from '@material-ui/core/Switch'
import { FormControlLabel, useMediaQuery, useTheme } from '@material-ui/core'
import { settingsHost, gstSettingsHost } from 'utils/Hosts'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { clearTMDBCache } from 'components/Add/helpers'
import AppBar from '@material-ui/core/AppBar'
import SwipeableViews from 'react-swipeable-views'
import CircularProgress from '@material-ui/core/CircularProgress'
import { StyledDialog } from 'style/CustomMaterialUiStyles'
import useOnStandaloneAppOutsideClick from 'utils/useOnStandaloneAppOutsideClick'

import { SettingsHeader, FooterSection, Content, StyledTabs, StyledTab } from './style'
import defaultSettings from './defaultSettings'
import { a11yProps, TabPanel } from './tabComponents'
import PrimarySettingsComponent from './PrimarySettingsComponent'
import SecondarySettingsComponent from './SecondarySettingsComponent'
import MobileAppSettings from './MobileAppSettings'
import TorznabSettings from './TorznabSettings'
import TMDBSettings from './TMDBSettings'
import GStreamerSettings from './GStreamerSettings'
import WAFSettings from './WAFSettings'

export default function SettingsDialog({ handleClose }) {
  const { t } = useTranslation()
  const fullScreen = useMediaQuery('@media (max-width:930px)')
  const { direction } = useTheme()

  const [settings, setSettings] = useState()
  const [selectedTab, setSelectedTab] = useState(0)
  const [cacheSize, setCacheSize] = useState(32)
  const [cachePercentage, setCachePercentage] = useState(40)
  const [preloadCachePercentage, setPreloadCachePercentage] = useState(0)
  const [isProMode, setIsProMode] = useState(readStoredBoolean('isProMode'))
  const [isVlcUsed, setIsVlcUsed] = useState(readStoredBoolean('isVlcUsed'))
  const [isInfuseUsed, setIsInfuseUsed] = useState(readStoredBoolean('isInfuseUsed'))
  const [isIinaUsed, setIsIinaUsed] = useState(readStoredBoolean('isIinaUsed'))
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [gstAvailable, setGstAvailable] = useState(false)
  const [wafDirty, setWAFDirty] = useState(false)
  const tabMain = 0
  const tabAdditional = 1
  const tabSearch = 2
  const tabApp = 3
  const tabAccess = 4
  const tabGStreamer = 5
  const maxTab = gstAvailable ? tabGStreamer : tabAccess

  useEffect(() => {
    axios
      .get(gstSettingsHost())
      .then(({ data }) => setGstAvailable(Boolean(data.built_in)))
      .catch(() => setGstAvailable(false))
  }, [])

  // eslint-disable-next-line no-alert
  const confirmWAFDiscard = useCallback(() => !wafDirty || window.confirm(t('WAF.UnsavedConfirm')), [wafDirty, t])

  useEffect(() => {
    const controller = new AbortController()
    let mounted = true

    setIsLoading(true)
    setLoadError('')
    axios
      .post(settingsHost(), { action: 'get' }, { signal: controller.signal })
      .then(({ data }) => {
        if (mounted) setSettings({ ...data, CacheSize: data.CacheSize / (1024 * 1024) })
      })
      .catch(error => {
        if (mounted && error?.code !== 'ERR_CANCELED') {
          setSettings()
          setLoadError(getSettingsError(error, t('SettingsDialog.SaveError')))
        }
      })
      .finally(() => mounted && setIsLoading(false))

    return () => {
      mounted = false
      controller.abort()
    }
  }, [loadAttempt, t])

  const requestClose = useCallback(() => {
    if (!isSaving && confirmWAFDiscard()) handleClose()
  }, [handleClose, isSaving, confirmWAFDiscard])
  const ref = useOnStandaloneAppOutsideClick(requestClose)

  const handleSave = async () => {
    if (!settings || isSaving || !confirmWAFDiscard()) return

    setIsSaving(true)
    setSaveError('')
    const sets = JSON.parse(JSON.stringify(settings))
    sets.CacheSize = cacheSize * 1024 * 1024
    sets.ReaderReadAHead = cachePercentage
    sets.PreloadCache = preloadCachePercentage

    try {
      await axios.post(settingsHost(), { action: 'set', sets })
      // Clear TMDB cache so fresh settings are fetched on next poster search.
      clearTMDBCache()
      writeStoredBoolean('isVlcUsed', isVlcUsed)
      writeStoredBoolean('isInfuseUsed', isInfuseUsed)
      writeStoredBoolean('isIinaUsed', isIinaUsed)
      handleClose()
    } catch (error) {
      setSaveError(getSettingsError(error, t('SettingsDialog.SaveError')))
      setIsSaving(false)
    }
  }

  const inputForm = ({ target: { type, value, checked, id } }) => {
    if (!settings) return
    const sets = JSON.parse(JSON.stringify(settings))

    if (type === 'number' || type === 'select-one') {
      sets[id] = Number(value)
    } else if (type === 'checkbox') {
      if (
        id === 'DisableTCP' ||
        id === 'DisableUTP' ||
        id === 'DisableUPNP' ||
        id === 'DisableDHT' ||
        id === 'DisablePEX' ||
        id === 'DisableUpload'
      )
        sets[id] = Boolean(!checked)
      else sets[id] = Boolean(checked)
    } else if (type === 'url' || type === 'text' || type === 'textarea') {
      sets[id] = value
    } else if (!type && value !== undefined) {
      // Fallback for custom handlers that don't provide type
      sets[id] = value
    }
    setSettings(sets)
  }

  useEffect(() => {
    if (selectedTab > maxTab) {
      setSelectedTab(0)
    }
  }, [gstAvailable, selectedTab, maxTab])

  const { CacheSize, ReaderReadAHead, PreloadCache } = settings || {}

  useEffect(() => {
    if (isNaN(CacheSize) || isNaN(ReaderReadAHead) || isNaN(PreloadCache)) return

    setCacheSize(CacheSize)
    setCachePercentage(ReaderReadAHead)
    setPreloadCachePercentage(PreloadCache)
  }, [CacheSize, ReaderReadAHead, PreloadCache])

  const updateSettings = newProps => setSettings(current => (current ? { ...current, ...newProps } : current))
  const handleChangeIndex = index => {
    if (selectedTab === tabAccess && index !== tabAccess && !confirmWAFDiscard()) return
    setSelectedTab(index)
  }
  const handleChange = (_, newValue) => handleChangeIndex(newValue)

  return (
    <StyledDialog open onClose={requestClose} fullScreen={fullScreen} fullWidth maxWidth='md' ref={ref}>
      <SettingsHeader>
        <div>{t('SettingsDialog.Settings')}</div>
        <FormControlLabel
          control={
            <Switch
              checked={isProMode}
              onChange={({ target: { checked } }) => {
                if (!checked && selectedTab === tabAccess && !confirmWAFDiscard()) return
                setIsProMode(checked)
                writeStoredBoolean('isProMode', checked)
                if (!checked) setSelectedTab(0)
              }}
              style={{ color: 'white' }}
            />
          }
          label={t('SettingsDialog.ProMode')}
          labelPlacement='start'
        />
      </SettingsHeader>

      <AppBar position='static' color='default'>
        <StyledTabs
          value={selectedTab}
          onChange={handleChange}
          indicatorColor='secondary'
          textColor='secondary'
          variant='scrollable'
          scrollButtons='auto'
        >
          <StyledTab label={t('SettingsDialog.Tabs.Main')} {...a11yProps(0)} />

          <StyledTab
            disabled={!isProMode}
            label={
              <>
                <span>{t('SettingsDialog.Tabs.Additional')}</span>
                {!isProMode && <span className='disabled-hint'>{t('SettingsDialog.Tabs.AdditionalDisabled')}</span>}
              </>
            }
            {...a11yProps(1)}
          />

          <StyledTab label={t('Search')} {...a11yProps(tabSearch)} />

          <StyledTab label={t('SettingsDialog.Tabs.App')} {...a11yProps(tabApp)} />

          <StyledTab label={t('SettingsDialog.Tabs.Access')} {...a11yProps(tabAccess)} />

          {gstAvailable && (
            <StyledTab
              disabled={!isProMode}
              label={
                <>
                  <span>{t('GStreamer.Tab')}</span>
                  {!isProMode && <span className='disabled-hint'>{t('SettingsDialog.Tabs.AdditionalDisabled')}</span>}
                </>
              }
              {...a11yProps(tabGStreamer)}
            />
          )}
        </StyledTabs>
      </AppBar>

      <Content isLoading={isLoading}>
        {isLoading ? (
          <CircularProgress color='secondary' />
        ) : loadError ? (
          <div role='alert' style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ marginBottom: 12 }}>{loadError}</div>
            <Button color='secondary' onClick={() => setLoadAttempt(value => value + 1)} variant='outlined'>
              {t('Update')}
            </Button>
          </div>
        ) : settings ? (
          <>
            <SwipeableViews
              axis={direction === 'rtl' ? 'x-reverse' : 'x'}
              index={selectedTab}
              onChangeIndex={handleChangeIndex}
            >
              <TabPanel value={selectedTab} index={tabMain} dir={direction}>
                <PrimarySettingsComponent
                  settings={settings}
                  inputForm={inputForm}
                  cachePercentage={cachePercentage}
                  preloadCachePercentage={preloadCachePercentage}
                  cacheSize={cacheSize}
                  isProMode={isProMode}
                  setCacheSize={setCacheSize}
                  setCachePercentage={setCachePercentage}
                  setPreloadCachePercentage={setPreloadCachePercentage}
                  updateSettings={updateSettings}
                />
              </TabPanel>

              <TabPanel value={selectedTab} index={tabAdditional} dir={direction}>
                <SecondarySettingsComponent settings={settings} inputForm={inputForm} updateSettings={updateSettings} />
              </TabPanel>

              <TabPanel value={selectedTab} index={tabSearch} dir={direction}>
                <TorznabSettings
                  settings={settings}
                  inputForm={inputForm}
                  updateSettings={updateSettings}
                  isProMode={isProMode}
                />
              </TabPanel>

              <TabPanel value={selectedTab} index={tabApp} dir={direction}>
                <TMDBSettings settings={settings} updateSettings={updateSettings} />
                <MobileAppSettings
                  isVlcUsed={isVlcUsed}
                  setIsVlcUsed={setIsVlcUsed}
                  isInfuseUsed={isInfuseUsed}
                  setIsInfuseUsed={setIsInfuseUsed}
                  isIinaUsed={isIinaUsed}
                  setIsIinaUsed={setIsIinaUsed}
                />
              </TabPanel>

              <TabPanel value={selectedTab} index={tabAccess} dir={direction}>
                <WAFSettings onDirtyChange={setWAFDirty} />
              </TabPanel>

              {gstAvailable && (
                <TabPanel value={selectedTab} index={tabGStreamer} dir={direction}>
                  <GStreamerSettings />
                </TabPanel>
              )}
            </SwipeableViews>
          </>
        ) : null}
      </Content>

      {saveError && (
        <div role='alert' style={{ color: '#d32f2f', padding: '0 24px 8px' }}>
          {saveError}
        </div>
      )}

      <FooterSection>
        <Button onClick={requestClose} color='secondary' variant='outlined' disabled={isSaving}>
          {t('Cancel')}
        </Button>

        <Button
          onClick={() => {
            setCacheSize(defaultSettings.CacheSize)
            setCachePercentage(defaultSettings.ReaderReadAHead)
            setPreloadCachePercentage(defaultSettings.PreloadCache)
            updateSettings(defaultSettings)
            // Clear TMDB cache when resetting to defaults
            clearTMDBCache()
          }}
          color='secondary'
          variant='outlined'
          disabled={!settings || isLoading || isSaving}
        >
          {t('SettingsDialog.ResetToDefault')}
        </Button>

        <Button
          variant='contained'
          onClick={handleSave}
          color='secondary'
          disabled={!settings || isLoading || isSaving}
        >
          {isSaving ? <CircularProgress size={20} style={{ color: 'white' }} /> : t('Save')}
        </Button>
      </FooterSection>
    </StyledDialog>
  )
}

const readStoredBoolean = key => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? false
  } catch (error) {
    return false
  }
}

const writeStoredBoolean = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch (error) {
    // Browser storage is optional; server settings must remain usable when it is unavailable.
  }
}

const getSettingsError = (error, fallback) => {
  const responseData = error?.response?.data
  const details =
    (typeof responseData === 'string' && responseData.trim()) || responseData?.error || error?.message || fallback
  return details.startsWith(fallback) ? details : `${fallback}${details}`
}
