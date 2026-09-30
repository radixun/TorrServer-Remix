import axios from 'axios'
import Button from '@material-ui/core/Button'
import Switch from '@material-ui/core/Switch'
import { FormControlLabel, useMediaQuery, useTheme } from '@material-ui/core'
import { settingsHost } from 'utils/Hosts'
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
    if (!isSaving) handleClose()
  }, [handleClose, isSaving])
  const ref = useOnStandaloneAppOutsideClick(requestClose)

  const handleSave = async () => {
    if (!settings || isSaving) return

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
    } else if (type === 'url' || type === 'text') {
      sets[id] = value
    } else if (!type && value !== undefined) {
      // Fallback for custom handlers that don't provide type (e.g., ProxyHosts array)
      sets[id] = value
    }
    setSettings(sets)
  }

  const { CacheSize, ReaderReadAHead, PreloadCache } = settings || {}

  useEffect(() => {
    if (isNaN(CacheSize) || isNaN(ReaderReadAHead) || isNaN(PreloadCache)) return

    setCacheSize(CacheSize)
    setCachePercentage(ReaderReadAHead)
    setPreloadCachePercentage(PreloadCache)
  }, [CacheSize, ReaderReadAHead, PreloadCache])

  const updateSettings = newProps => setSettings(current => (current ? { ...current, ...newProps } : current))
  const handleChange = (_, newValue) => setSelectedTab(newValue)
  const handleChangeIndex = index => setSelectedTab(index)

  return (
    <StyledDialog open onClose={requestClose} fullScreen={fullScreen} fullWidth maxWidth='md' ref={ref}>
      <SettingsHeader>
        <div>{t('SettingsDialog.Settings')}</div>
        <FormControlLabel
          control={
            <Switch
              checked={isProMode}
              onChange={({ target: { checked } }) => {
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

          <StyledTab label={t('Search')} {...a11yProps(2)} />

          <StyledTab label={t('SettingsDialog.Tabs.App')} {...a11yProps(3)} />
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
              <TabPanel value={selectedTab} index={0} dir={direction}>
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

              <TabPanel value={selectedTab} index={1} dir={direction}>
                <SecondarySettingsComponent settings={settings} inputForm={inputForm} updateSettings={updateSettings} />
              </TabPanel>

              <TabPanel value={selectedTab} index={2} dir={direction}>
                <TorznabSettings settings={settings} inputForm={inputForm} updateSettings={updateSettings} />
              </TabPanel>

              <TabPanel value={selectedTab} index={3} dir={direction}>
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
